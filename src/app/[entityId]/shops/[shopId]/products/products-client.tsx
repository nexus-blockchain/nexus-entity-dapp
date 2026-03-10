'use client';

import React, { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { z } from 'zod';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useProducts } from '@/hooks/use-products';
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
    priceNex: z.string().refine(
      (v) => { const n = Number(v); return !isNaN(n) && n > 0; },
      { message: 'NEX 价格必须大于 0' },
    ),
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
  })
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
  value,
  onChange,
  accept,
  error,
  id,
}: {
  label: string;
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
      <Label htmlFor={id}>{label}</Label>
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

function ProductCard({ product, shopId }: { product: ProductData; shopId: number }) {
  const t = useTranslations('shops');
  const te = useTranslations('enums');
  const badgeCfg = STATUS_BADGE_VARIANT[product.status];
  const { isReadOnly, isSuspended } = useEntityContext();
  const { listProduct, delistProduct } = useProducts(shopId);
  const validTransitions = getValidProductTransitions(product.status);
  const canAct = !isReadOnly && !isSuspended;

  const handleTransition = useCallback(
    (target: ProductStatus) => {
      if (target === ProductStatus.OnSale) {
        // Draft->OnSale or OffShelf->OnSale
        listProduct.mutate([product.id]);
      } else if (target === ProductStatus.OffShelf) {
        // OnSale->OffShelf
        delistProduct.mutate([product.id]);
      }
      // SoldOut is set automatically by chain when stock reaches 0
    },
    [product.id, listProduct, delistProduct],
  );

  return (
    <Card className="overflow-hidden">
      <div className="aspect-square overflow-hidden">
        <IpfsImage cid={product.imageCid} alt={t('products.productImage')} className="h-full w-full" />
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
        <p className="text-sm font-semibold">
          {formatNexBalance(product.priceNex)} NEX
        </p>
        {product.priceUsdt > 0 && (
          <p className="text-sm text-muted-foreground">${formatUsdtPrice(product.priceUsdt)} USDT</p>
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
        {(product.minQuantity > 1 || product.maxQuantity > 0) && (
          <p className="text-xs text-muted-foreground">
            {t('products.purchaseRange', { min: product.minQuantity, max: product.maxQuantity > 0 ? ` ~ ${product.maxQuantity}` : '+' })}
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

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const result = createProductSchema.safeParse(form);
      if (!result.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of result.error.issues) {
          const key = issue.path[0];
          if (key) fieldErrors[String(key)] = issue.message;
        }
        setErrors(fieldErrors);
        return;
      }

      // Convert NEX price to chain balance (12 decimals)
      const nexParts = form.priceNex.split('.');
      const nexWhole = nexParts[0] ?? '0';
      const nexFrac = (nexParts[1] ?? '').padEnd(12, '0').slice(0, 12);
      const rawNex = BigInt(nexWhole) * BigInt('1000000000000') + BigInt(nexFrac);

      // Convert USDT price to u64 (10^6 precision)
      const usdtVal = Math.round(Number(form.priceUsdt) * 1_000_000);

      const levelGate = form.visibility === ProductVisibility.LevelGated && form.levelGate
        ? Number(form.levelGate)
        : null;

      createProduct.mutate([
        shopId,
        form.nameCid,
        form.imageCid,
        form.detailCid,
        rawNex.toString(),
        usdtVal,
        Number(form.stock),
        form.category,
        form.visibility,
        levelGate,
        Number(form.minQuantity),
        Number(form.maxQuantity),
      ]);
    },
    [form, shopId, createProduct],
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
            value={form.nameCid}
            onChange={(cid) => setField('nameCid', cid)}
            error={errors.nameCid}
          />
          <IpfsUploadField
            id="product-image"
            label={t('products.productImage')}
            value={form.imageCid}
            onChange={(cid) => setField('imageCid', cid)}
            accept="image/*"
            error={errors.imageCid}
          />
          <IpfsUploadField
            id="product-detail"
            label={t('products.productDetail')}
            value={form.detailCid}
            onChange={(cid) => setField('detailCid', cid)}
            error={errors.detailCid}
          />

          {/* Pricing */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="price-nex">{t('products.nexPrice')}</Label>
              <Input
                id="price-nex"
                type="text"
                inputMode="decimal"
                value={form.priceNex}
                onChange={(e) => setField('priceNex', e.target.value)}
                placeholder={t('products.nexPrice')}
              />
              {errors.priceNex && <p className="text-xs text-destructive">{errors.priceNex}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="price-usdt">{t('products.usdtPrice')}</Label>
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
          </div>

          {/* Stock & Category */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="stock">{t('products.stock')}</Label>
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
              <Label htmlFor="category">{t('products.category')}</Label>
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
              <Label htmlFor="visibility">{t('products.visibility')}</Label>
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
              <Label htmlFor="level-gate">{t('products.levelGate')}</Label>
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
              <Label htmlFor="min-qty">{t('products.minQuantity')}</Label>
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
              <Label htmlFor="max-qty">{t('products.maxQuantity')}</Label>
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
  const { isReadOnly, isSuspended } = useEntityContext();
  const { products, isLoading, error } = useProducts(shopId);

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
        <PermissionGuard required={AdminPermission.SHOP_MANAGE} fallback={null}>
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
            <ProductCard key={product.id} product={product} shopId={shopId} />
          ))}
        </div>
      )}
    </div>
  );
}
