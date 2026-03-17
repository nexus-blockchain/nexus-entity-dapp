'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { z } from 'zod';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useProducts } from '@/hooks/use-products';
import { useNexUsdtPrice } from '@/hooks/use-nex-price';
import { useIpfsUpload } from '@/hooks/use-ipfs-upload';
import { PermissionGuard } from '@/components/permission-guard';
import { IpfsImage } from '@/components/ipfs-image';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { AdminPermission } from '@/lib/types/models';
import { ProductCategory, ProductVisibility, ProductStatus } from '@/lib/types/enums';
import { getValidProductTransitions } from '@/lib/utils';
import type { ProductData } from '@/lib/types/models';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelWithTip } from '@/components/field-help-tip';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Zod Schema ─────────────────────────────────────────────

const createProductSchema = z
  .object({
    nameCid: z.string().min(1, '请上传商品名称'),
    imageCid: z.string().min(1, '请上传商品图片'),
    detailCid: z.string().min(1, '请上传商品详情'),
    priceNex: z.string(),
    priceUsdt: z.string().refine(
      (v) => { const n = Number(v); return !isNaN(n) && n >= 0; },
      { message: 'USDT 价格必须 >= 0' },
    ),
    stock: z.string().refine(
      (v) => { const n = Number(v); return Number.isInteger(n) && n >= 0; },
      { message: '库存必须 >= 0（0 表示无限）' },
    ),
    category: z.nativeEnum(ProductCategory),
    visibility: z.nativeEnum(ProductVisibility),
    levelGate: z.string().optional(),
    minQuantity: z.string().refine(
      (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1; },
      { message: '最小购买量必须 >= 1' },
    ),
    maxQuantity: z.string().refine(
      (v) => { const n = Number(v); return Number.isInteger(n) && n >= 0; },
      { message: '最大购买量必须 >= 0（0 表示不限）' },
    ),
    // These are injected at validation time, not from user input
    _nexAutoCalc: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // When NEX is auto-calculated (rate available + USDT>0), skip NEX validation
      if (data._nexAutoCalc) return true;
      const n = Number(data.priceNex);
      return !isNaN(n) && n > 0;
    },
    { message: 'NEX 价格必须大于 0', path: ['priceNex'] },
  )
  .refine(
    (data) => {
      const max = Number(data.maxQuantity);
      const min = Number(data.minQuantity);
      return max === 0 || max >= min;
    },
    { message: '最大购买量必须 >= 最小购买量（或为 0 表示不限）', path: ['maxQuantity'] },
  );

type CreateProductFormData = z.infer<typeof createProductSchema>;

// ─── Constants ──────────────────────────────────────────────

const STATUS_BADGE_VARIANT: Record<ProductStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' }> = {
  [ProductStatus.Draft]: { variant: 'secondary' },
  [ProductStatus.OnSale]: { variant: 'success' },
  [ProductStatus.SoldOut]: { variant: 'warning' },
  [ProductStatus.OffShelf]: { variant: 'destructive' },
};

const TRANSITION_ACTION: Record<ProductStatus, { variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' }> = {
  [ProductStatus.OnSale]: { variant: 'default' },
  [ProductStatus.OffShelf]: { variant: 'destructive' },
  [ProductStatus.SoldOut]: { variant: 'secondary' },
  [ProductStatus.Draft]: { variant: 'outline' },
};

function formatNexBalance(balance: bigint): string {
  const divisor = BigInt('1000000000000');
  const whole = balance / divisor;
  const remainder = balance % divisor;
  const decStr = remainder.toString().padStart(12, '0').slice(0, 4);
  const trimmed = decStr.replace(/0+$/, '');
  return trimmed ? `${whole.toLocaleString()}.${trimmed}` : whole.toLocaleString();
}

function formatUsdtPrice(raw: number): string {
  return (raw / 1_000_000).toFixed(2);
}

// ─── Loading Skeleton ────────────────────────────────────────

function ProductsLoadingSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-24" />
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <Skeleton className="aspect-square w-full rounded-t-lg" />
            <CardContent className="space-y-2 pt-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── IPFS Upload Field ──────────────────────────────────────

function IpfsUploadField({
  label,
  tip,
  value,
  onChange,
  accept,
  error,
  id,
}: {
  label: string;
  tip?: string;
  value: string;
  onChange: (cid: string) => void;
  accept?: string;
  error?: string;
  id: string;
}) {
  const t = useTranslations('shops');
  const { upload, uploadText, isUploading, error: uploadError } = useIpfsUpload();

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const cid = await upload(file);
      if (cid) onChange(cid);
    },
    [upload, onChange],
  );

  const handleText = useCallback(
    async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value.trim();
      if (!text) return;
      const cid = await uploadText(text);
      if (cid) onChange(cid);
    },
    [uploadText, onChange],
  );

  return (
    <div className="space-y-2">
      <LabelWithTip htmlFor={id} tip={tip}>{label}</LabelWithTip>
      {accept ? (
        <Input
          id={id}
          type="file"
          accept={accept}
          onChange={handleFile}
          disabled={isUploading}
          className="file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:text-primary hover:file:bg-primary/20"
        />
      ) : (
        <Textarea
          id={id}
          rows={2}
          placeholder={t('products.ipfsTextPlaceholder')}
          onBlur={handleText}
          disabled={isUploading}
        />
      )}
      {isUploading && <p className="text-xs text-primary">{t('products.uploadingIpfs')}</p>}
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
      {value && <p className="truncate text-xs text-green-600">CID: {value}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── Product Card ───────────────────────────────────────────

function ProductCard({ product, shopId, nexPerUsdt }: { product: ProductData; shopId: number; nexPerUsdt: bigint | null }) {
  const t = useTranslations('shops');
  const te = useTranslations('enums');
  const badgeCfg = STATUS_BADGE_VARIANT[product.status];
  const { isReadOnly, isSuspended } = useEntityContext();
  const { publishProduct, unpublishProduct } = useProducts(shopId);
  const validTransitions = getValidProductTransitions(product.status);
  const canAct = !isReadOnly && !isSuspended;

  const handleTransition = useCallback(
    (target: ProductStatus) => {
      if (target === ProductStatus.OnSale) {
        publishProduct.mutate([product.id]);
      } else if (target === ProductStatus.OffShelf) {
        unpublishProduct.mutate([product.id]);
      }
    },
    [product.id, publishProduct, unpublishProduct],
  );

  // Compute realtime approx NEX from USDT price + exchange rate
  const approxNex = useMemo(() => {
    if (product.usdtPrice <= 0 || !nexPerUsdt) return null;
    // usdtPrice is stored as u64 with 10^6 precision
    // nexPerUsdt is "1 USDT = X NEX" with 10^12 precision
    // approxNex = usdtPrice * nexPerUsdt / 10^6
    const raw = BigInt(product.usdtPrice) * nexPerUsdt / BigInt(1_000_000);
    return raw;
  }, [product.usdtPrice, nexPerUsdt]);

  return (
    <Card className="overflow-hidden">
      <div className="aspect-square overflow-hidden">
        <IpfsImage cid={product.imagesCid} alt={t('products.productImage')} className="h-full w-full" />
      </div>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-start justify-between">
          <CardDescription>ID: {product.id}</CardDescription>
          <Badge variant={badgeCfg.variant}>
            {te(`productStatus.${product.status}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pb-2">
        {product.usdtPrice > 0 ? (
          <>
            <p className="text-sm font-semibold">${formatUsdtPrice(product.usdtPrice)} USDT</p>
            {approxNex && (
              <p className="text-xs text-muted-foreground">
                {t('products.approxNex', { amount: formatNexBalance(approxNex) })}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm font-semibold">
            {formatNexBalance(product.price)} NEX
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-xs font-normal">
            {te(`productCategory.${product.category}`)}
          </Badge>
          <Badge variant="outline" className="text-xs font-normal">
            {te(`productVisibility.${product.visibility}`)}
          </Badge>
          {product.visibility === ProductVisibility.LevelGated && product.levelGate != null && (
            <Badge variant="outline" className="text-xs font-normal">
              {t('products.levelGate')}&ge;{product.levelGate}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs font-normal">
            {product.stock === 0 ? t('products.stockUnlimited') : t('products.stockDisplay', { count: product.stock })}
          </Badge>
        </div>
        {(product.minOrderQuantity > 1 || product.maxOrderQuantity > 0) && (
          <p className="text-xs text-muted-foreground">
            {t('products.purchaseRange', { min: product.minOrderQuantity, max: product.maxOrderQuantity > 0 ? ` ~ ${product.maxOrderQuantity}` : '+' })}
          </p>
        )}
      </CardContent>

      {/* Status transition action buttons */}
      {canAct && validTransitions.length > 0 && (
        <PermissionGuard required={AdminPermission.SHOP_MANAGE} fallback={null}>
          <CardFooter className="flex-wrap gap-2 pb-4">
            {validTransitions
              .filter((t) => t !== ProductStatus.SoldOut) // SoldOut is chain-automatic
              .map((target) => {
                const action = TRANSITION_ACTION[target];
                const transLabel = target === ProductStatus.OnSale ? t('products.list')
                  : target === ProductStatus.OffShelf ? t('products.delist')
                  : target === ProductStatus.Draft ? t('products.toDraft')
                  : (te as any)(`productStatus.${target}`);
                return (
                  <Button
                    key={target}
                    variant={action.variant}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleTransition(target)}
                  >
                    {transLabel}
                  </Button>
                );
              })}
          </CardFooter>
        </PermissionGuard>
      )}
    </Card>
  );
}

// ─── Create Product Form ────────────────────────────────────

function CreateProductForm({ shopId }: { shopId: number }) {
  const { createProduct } = useProducts(shopId);
  const { entityId } = useEntityContext();
  const { nexPerUsdt, rateSource, isLoading: rateLoading } = useNexUsdtPrice(entityId);
  const t = useTranslations('shops');
  const te = useTranslations('enums');

  const [form, setForm] = useState({
    nameCid: '',
    imageCid: '',
    detailCid: '',
    priceNex: '',
    priceUsdt: '0',
    stock: '0',
    category: ProductCategory.Digital as ProductCategory,
    visibility: ProductVisibility.Public as ProductVisibility,
    levelGate: '',
    minQuantity: '1',
    maxQuantity: '0',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setField = useCallback((key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // Determine if NEX should be auto-calculated
  const usdtNum = Number(form.priceUsdt) || 0;
  const nexAutoCalc = usdtNum > 0 && nexPerUsdt !== null;
  const nexIsReadOnly = nexAutoCalc;

  // Auto-calculated NEX display value
  const autoNexDisplay = useMemo(() => {
    if (!nexAutoCalc || !nexPerUsdt) return '';
    // USDT input is a human-readable decimal (e.g. "10.5")
    // Convert to u64 (10^6 precision), then multiply by nexPerUsdt (10^12 precision), divide by 10^6
    const usdtMicro = Math.round(usdtNum * 1_000_000);
    if (usdtMicro <= 0) return '';
    const rawNex = BigInt(usdtMicro) * nexPerUsdt / BigInt(1_000_000);
    return formatNexBalance(rawNex);
  }, [nexAutoCalc, nexPerUsdt, usdtNum]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      // Inject auto-calc flag for schema validation
      const validationData = { ...form, _nexAutoCalc: nexAutoCalc };
      const result = createProductSchema.safeParse(validationData);
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const key = issue.path[0];
          if (key) fieldErrors[String(key)] = issue.message;
        }
        setErrors(fieldErrors);
        return;
      }

      // Convert USDT price to u64 (10^6 precision)
      const usdtVal = Math.round(usdtNum * 1_000_000);

      createProduct.mutate([
        shopId,
        form.nameCid,
        form.imageCid,
        form.detailCid,
        usdtVal,
        Number(form.stock),
        form.category,
        0, // sortWeight
        '', // tagsCid (required Vec<u8>)
        '', // skuCid (required Vec<u8>)
        Number(form.minQuantity),
        Number(form.maxQuantity),
        form.visibility,
      ]);
    },
    [form, shopId, createProduct, nexAutoCalc, usdtNum],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('products.createProduct')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* IPFS uploads */}
          <IpfsUploadField
            id="product-name"
            label={t('products.productName')}
            tip={t('help.productName')}
            value={form.nameCid}
            onChange={(cid) => setField('nameCid', cid)}
            error={errors.nameCid}
          />
          <IpfsUploadField
            id="product-image"
            label={t('products.productImage')}
            tip={t('help.productImage')}
            value={form.imageCid}
            onChange={(cid) => setField('imageCid', cid)}
            accept="image/*"
            error={errors.imageCid}
          />
          <IpfsUploadField
            id="product-detail"
            label={t('products.productDetail')}
            tip={t('help.productDetail')}
            value={form.detailCid}
            onChange={(cid) => setField('detailCid', cid)}
            error={errors.detailCid}
          />

          {/* Pricing — USDT primary, NEX auto-calculated or manual */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <LabelWithTip htmlFor="price-usdt" tip={t('help.usdtPrice')}>{t('products.usdtPrice')}</LabelWithTip>
              <Input
                id="price-usdt"
                type="text"
                inputMode="decimal"
                value={form.priceUsdt}
                onChange={(e) => setField('priceUsdt', e.target.value)}
                placeholder="0"
              />
              {errors.priceUsdt && <p className="text-xs text-destructive">{errors.priceUsdt}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="price-nex">
                {nexIsReadOnly ? t('products.nexAutoCalc') : t('products.nexPrice')}
              </Label>
              {nexIsReadOnly ? (
                <>
                  <Input
                    id="price-nex"
                    type="text"
                    value={autoNexDisplay}
                    readOnly
                    className="bg-muted"
                  />
                  {rateSource && (
                    <p className="text-xs text-muted-foreground">
                      {t('products.rateSource', { source: rateSource === 'twap' ? 'TWAP' : rateSource === 'lastPrice' ? 'Last Price' : 'Initial Price' })}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Input
                    id="price-nex"
                    type="text"
                    inputMode="decimal"
                    value={form.priceNex}
                    onChange={(e) => setField('priceNex', e.target.value)}
                    placeholder={t('products.nexPrice')}
                  />
                  {usdtNum > 0 && !rateLoading && !nexPerUsdt && (
                    <p className="text-xs text-amber-600">{t('products.nexManualFallback')}</p>
                  )}
                </>
              )}
              {errors.priceNex && <p className="text-xs text-destructive">{errors.priceNex}</p>}
            </div>
          </div>

          {/* Stock & Category */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <LabelWithTip htmlFor="stock" tip={t('help.stock')}>{t('products.stock')}</LabelWithTip>
              <Input
                id="stock"
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => setField('stock', e.target.value)}
              />
              {errors.stock && <p className="text-xs text-destructive">{errors.stock}</p>}
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="category" tip={t('help.category')}>{t('products.category')}</LabelWithTip>
              <Select value={form.category} onValueChange={(v) => setField('category', v)}>
                <SelectTrigger id="category">
                  <SelectValue placeholder={t('products.category')} />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ProductCategory).map((c) => (
                    <SelectItem key={c} value={c}>{te(`productCategory.${c}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="visibility" tip={t('help.visibility')}>{t('products.visibility')}</LabelWithTip>
              <Select value={form.visibility} onValueChange={(v) => setField('visibility', v)}>
                <SelectTrigger id="visibility">
                  <SelectValue placeholder={t('products.visibility')} />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ProductVisibility).map((v) => (
                    <SelectItem key={v} value={v}>{te(`productVisibility.${v}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Level gate (only when LevelGated) */}
          {form.visibility === ProductVisibility.LevelGated && (
            <div className="space-y-2">
              <LabelWithTip htmlFor="level-gate" tip={t('help.levelGate')}>{t('products.levelGate')}</LabelWithTip>
              <Input
                id="level-gate"
                type="number"
                min="1"
                value={form.levelGate}
                onChange={(e) => setField('levelGate', e.target.value)}
                placeholder={t('products.levelGatePlaceholder')}
              />
            </div>
          )}

          {/* Purchase quantity */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <LabelWithTip htmlFor="min-qty" tip={t('help.minQuantity')}>{t('products.minQuantity')}</LabelWithTip>
              <Input
                id="min-qty"
                type="number"
                min="1"
                value={form.minQuantity}
                onChange={(e) => setField('minQuantity', e.target.value)}
              />
              {errors.minQuantity && <p className="text-xs text-destructive">{errors.minQuantity}</p>}
            </div>
            <div className="space-y-2">
              <LabelWithTip htmlFor="max-qty" tip={t('help.maxQuantity')}>{t('products.maxQuantity')}</LabelWithTip>
              <Input
                id="max-qty"
                type="number"
                min="0"
                value={form.maxQuantity}
                onChange={(e) => setField('maxQuantity', e.target.value)}
              />
              {errors.maxQuantity && <p className="text-xs text-destructive">{errors.maxQuantity}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={createProduct.txState.status === 'signing' || createProduct.txState.status === 'broadcasting'}
            >
              {t('products.createProduct')}
            </Button>
            <TxStatusIndicator txState={createProduct.txState} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function ProductsPage() {
  const t = useTranslations('shops');
  const tc = useTranslations('common');
  const params = useParams();
  const shopId = Number(params.shopId);
  const { isReadOnly, isSuspended, entityId } = useEntityContext();
  const { products, isLoading, error } = useProducts(shopId);
  const { nexPerUsdt } = useNexUsdtPrice(entityId);

  if (isLoading) {
    return <ProductsLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-destructive">
        {tc('loadFailed', { error: String(error) })}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('products.title')}</h1>

      {/* Create product form — requires SHOP_MANAGE */}
      {!isReadOnly && !isSuspended && (
        <PermissionGuard required={AdminPermission.SHOP_MANAGE}>
          <CreateProductForm shopId={shopId} />
        </PermissionGuard>
      )}

      {/* Product list */}
      {products.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">{t('products.noProducts')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} shopId={shopId} nexPerUsdt={nexPerUsdt} />
          ))}
        </div>
      )}
    </div>
  );
}
