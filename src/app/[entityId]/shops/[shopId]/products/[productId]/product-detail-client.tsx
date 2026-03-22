'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEntityContext } from '@/app/[entityId]/entity-provider';
import { useProduct } from '@/hooks/use-products';
import { useNexUsdtPrice } from '@/hooks/use-nex-price';
import { useIpfsUpload } from '@/hooks/use-ipfs-upload';
import { useCommission, useProductCommissionRate } from '@/hooks/use-commission';
import { PermissionGuard } from '@/components/permission-guard';
import { IpfsImage } from '@/components/ipfs-image';
import { TxStatusIndicator } from '@/components/tx-status-indicator';
import { TxConfirmDialog } from '@/components/tx-confirm-dialog';
import { AdminPermission } from '@/lib/types/models';
import type { ConfirmDialogConfig } from '@/lib/types/models';
import { ProductCategory, ProductVisibility, ProductStatus } from '@/lib/types/enums';
import { getValidProductTransitions } from '@/lib/utils';

import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabelWithTip } from '@/components/field-help-tip';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

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

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="aspect-video w-full rounded-md" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><Skeleton className="h-6 w-36" /></CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
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

// ─── Commission Rate Card ────────────────────────────────────

function bpsDisplay(bps: number): string {
  return `${bps} bps = ${(bps / 100).toFixed(2)}%`;
}

function CommissionRateCard({ productId, shopId, canAct }: { productId: number; shopId: number; canAct: boolean }) {
  const t = useTranslations('shops.products.detail.commission');
  const { entityId } = useEntityContext();
  const { coreConfig } = useCommission();
  const { productRate, shopRate, isLoading, setProductRate } = useProductCommissionRate(productId, shopId);
  const [newRate, setNewRateInput] = useState('');

  const entityRate = coreConfig?.maxCommissionRate ?? 0;
  const effectiveRate = productRate ?? shopRate ?? entityRate;

  const handleSet = useCallback(() => {
    const val = Number(newRate);
    if (!Number.isFinite(val) || val < 0 || val > 10000) return;
    setProductRate.mutate([entityId, shopId, productId, val]);
  }, [newRate, entityId, productId, shopId, setProductRate]);

  const handleClear = useCallback(() => {
    setProductRate.mutate([entityId, shopId, productId, null]);
  }, [entityId, productId, shopId, setProductRate]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-36" /></CardHeader>
        <CardContent><Skeleton className="h-20 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('title')}</CardTitle>
        <CardDescription>{t('desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Rate hierarchy */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('entityRate')}</span>
            <span className="font-medium">{bpsDisplay(entityRate)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('shopRate')}</span>
            <span className="font-medium">
              {shopRate != null ? bpsDisplay(shopRate) : <Badge variant="outline" className="text-xs">{t('notSet')}</Badge>}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t('productRate')}</span>
            <span className="font-medium">
              {productRate != null ? bpsDisplay(productRate) : <Badge variant="outline" className="text-xs">{t('notSet')}</Badge>}
            </span>
          </div>
          <div className="flex items-center justify-between border-t pt-2">
            <span className="font-medium">{t('effectiveRate')}</span>
            <span className="font-semibold text-primary">{bpsDisplay(effectiveRate)}</span>
          </div>
        </div>

        {/* Set / Clear form */}
        {canAct && (
          <PermissionGuard required={AdminPermission.COMMISSION_MANAGE} fallback={null}>
            <div className="space-y-3 border-t pt-3">
              <div className="space-y-2">
                <LabelWithTip htmlFor="commission-rate" tip={t('rateTip')}>{t('newRate')}</LabelWithTip>
                <div className="flex items-center gap-2">
                  <Input
                    id="commission-rate"
                    type="number"
                    min="0"
                    max="10000"
                    placeholder="bps"
                    value={newRate}
                    onChange={(e) => setNewRateInput(e.target.value)}
                    className="w-32"
                  />
                  <Button size="sm" onClick={handleSet} disabled={!newRate || setProductRate.txState.status === 'signing' || setProductRate.txState.status === 'broadcasting'}>
                    {t('setRate')}
                  </Button>
                  {productRate != null && (
                    <Button size="sm" variant="outline" onClick={handleClear} disabled={setProductRate.txState.status === 'signing' || setProductRate.txState.status === 'broadcasting'}>
                      {t('clearRate')}
                    </Button>
                  )}
                </div>
              </div>
              {setProductRate.txState.status !== 'idle' && (
                <TxStatusIndicator txState={setProductRate.txState} />
              )}
            </div>
          </PermissionGuard>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────

export function ProductDetailPage() {
  const t = useTranslations('shops');
  const te = useTranslations('enums');
  const tc = useTranslations('common');
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const productId = Number(params.productId);
  const shopId = Number(params.shopId);
  const { isReadOnly, isSuspended, entityId } = useEntityContext();
  const { product, isLoading, error, updateProduct, deleteProduct, publishProduct, unpublishProduct } = useProduct(productId);
  const { usdtPerNex, rateSource, isLoading: rateLoading } = useNexUsdtPrice(entityId);

  const canAct = !isReadOnly && !isSuspended;
  const canDelete = product != null && (product.status === ProductStatus.Draft || product.status === ProductStatus.OffShelf);
  const validTransitions = product ? getValidProductTransitions(product.status) : [];

  // ─── Edit form state ──────────────────────────────────────

  const [form, setForm] = useState({
    nameCid: '',
    imageCid: '',
    detailCid: '',
    priceUsdt: '0',
    stock: '0',
    category: ProductCategory.Digital as ProductCategory,
    visibility: ProductVisibility.Public as ProductVisibility,
    minQuantity: '1',
    maxQuantity: '0',
  });

  // Reset form when product data arrives / changes
  useEffect(() => {
    if (product) {
      setForm({
        nameCid: product.nameCid,
        imageCid: product.imagesCid,
        detailCid: product.detailCid,
        priceUsdt: product.usdtPrice > 0 ? (product.usdtPrice / 1_000_000).toString() : '0',
        stock: product.stock.toString(),
        category: product.category,
        visibility: product.visibility,
        minQuantity: product.minOrderQuantity.toString(),
        maxQuantity: product.maxOrderQuantity.toString(),
      });
    }
  }, [product?.id, product?.nameCid, product?.imagesCid, product?.detailCid, product?.usdtPrice, product?.stock, product?.category, product?.visibility, product?.minOrderQuantity, product?.maxOrderQuantity]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = useCallback((key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ─── NEX auto-calc ────────────────────────────────────────

  const usdtNum = Number(form.priceUsdt) || 0;
  const nexAutoCalc = usdtNum > 0 && usdtPerNex !== null;

  const autoNexDisplay = useMemo(() => {
    if (!nexAutoCalc || !usdtPerNex) return '';
    const usdtMicro = Math.round(usdtNum * 1_000_000);
    if (usdtMicro <= 0) return '';
    const rawNex = BigInt(usdtMicro) * BigInt('1000000000000') / usdtPerNex;
    return formatNexBalance(rawNex);
  }, [nexAutoCalc, usdtPerNex, usdtNum]);

  // Approx NEX for info card (from on-chain price)
  const approxNex = useMemo(() => {
    if (!product || product.usdtPrice <= 0 || !usdtPerNex) return null;
    return BigInt(product.usdtPrice) * BigInt('1000000000000') / usdtPerNex;
  }, [product?.usdtPrice, usdtPerNex]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Status transitions ───────────────────────────────────

  const handleTransition = useCallback(
    (target: ProductStatus) => {
      if (target === ProductStatus.OnSale) {
        publishProduct.mutate([productId]);
      } else if (target === ProductStatus.OffShelf) {
        unpublishProduct.mutate([productId]);
      }
    },
    [productId, publishProduct, unpublishProduct],
  );

  // ─── Edit submit ──────────────────────────────────────────

  const isBusy = updateProduct.txState.status === 'signing' || updateProduct.txState.status === 'broadcasting';

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!product) return;

      const newUsdtVal = Math.round(usdtNum * 1_000_000);
      const newStock = Number(form.stock);
      const newMinQty = Number(form.minQuantity);
      const newMaxQty = Number(form.maxQuantity);

      const nameCidArg = form.nameCid !== product.nameCid ? form.nameCid : null;
      const imageCidArg = form.imageCid !== product.imagesCid ? form.imageCid : null;
      const detailCidArg = form.detailCid !== product.detailCid ? form.detailCid : null;
      const usdtArg = newUsdtVal !== product.usdtPrice ? newUsdtVal : null;
      const stockArg = newStock !== product.stock ? newStock : null;
      const categoryArg = form.category !== product.category ? form.category : null;
      const minQtyArg = newMinQty !== product.minOrderQuantity ? newMinQty : null;
      const maxQtyArg = newMaxQty !== product.maxOrderQuantity ? newMaxQty : null;
      const visibilityArg = form.visibility !== product.visibility ? form.visibility : null;

      if (
        nameCidArg === null && imageCidArg === null && detailCidArg === null &&
        usdtArg === null && stockArg === null && categoryArg === null &&
        minQtyArg === null && maxQtyArg === null && visibilityArg === null
      ) {
        toast({ description: t('products.noChanges') });
        return;
      }

      updateProduct.mutate([
        product.id,
        nameCidArg,
        imageCidArg,
        detailCidArg,
        usdtArg,
        stockArg,
        categoryArg,
        null, // sortWeight
        null, // tagsCid
        null, // skuCid
        minQtyArg,
        maxQtyArg,
        visibilityArg,
      ]);
    },
    [form, product, usdtNum, updateProduct, t, toast],
  );

  // ─── Delete ───────────────────────────────────────────────

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleDelete = useCallback(() => {
    deleteProduct.mutate([productId]);
    setDeleteDialogOpen(false);
  }, [productId, deleteProduct]);

  // Navigate back after delete finalized
  useEffect(() => {
    if (deleteProduct.txState.status === 'finalized') {
      toast({ description: t('products.detail.deleted') });
      router.push(`/${entityId}/shops/${shopId}/products`);
    }
  }, [deleteProduct.txState.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteConfig: ConfirmDialogConfig = {
    title: t('products.deleteConfirmTitle'),
    description: t('products.deleteConfirmDesc', { id: productId }),
    severity: 'danger',
  };

  // ─── Render ───────────────────────────────────────────────

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-destructive">
        {tc('loadFailed', { error: String(error) })}
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/${entityId}/shops/${shopId}/products`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t('products.detail.backToProducts')}
          </Link>
        </Button>
        <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
          {t('products.detail.notFound')}
        </div>
      </div>
    );
  }

  const badgeCfg = STATUS_BADGE_VARIANT[product.status];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      {/* Header with back link */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/${entityId}/shops/${shopId}/products`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t('products.detail.backToProducts')}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{t('products.detail.title')}</h1>
      </div>

      {/* Product Info Card */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-lg">{t('products.detail.productInfo')}</CardTitle>
            <CardDescription>ID: {product.id}</CardDescription>
          </div>
          <Badge variant={badgeCfg.variant}>
            {te(`productStatus.${product.status}`)}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="aspect-video overflow-hidden rounded-md">
            <IpfsImage cid={product.imagesCid} alt={t('products.productImage')} className="h-full w-full" />
          </div>
          {product.usdtPrice > 0 ? (
            <>
              <p className="text-lg font-semibold">${formatUsdtPrice(product.usdtPrice)} USDT</p>
              {approxNex && (
                <p className="text-sm text-muted-foreground">
                  {t('products.approxNex', { amount: formatNexBalance(approxNex) })}
                </p>
              )}
            </>
          ) : (
            <p className="text-lg font-semibold">
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
            <p className="text-sm text-muted-foreground">
              {t('products.purchaseRange', { min: product.minOrderQuantity, max: product.maxOrderQuantity > 0 ? ` ~ ${product.maxOrderQuantity}` : '+' })}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Commission Rate Card */}
      <CommissionRateCard productId={productId} shopId={shopId} canAct={canAct} />

      {/* Status Actions */}
      {canAct && validTransitions.filter((s) => s !== ProductStatus.SoldOut).length > 0 && (
        <PermissionGuard required={AdminPermission.SHOP_MANAGE} fallback={null}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('products.detail.statusActions')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              {validTransitions
                .filter((s) => s !== ProductStatus.SoldOut)
                .map((target) => {
                  const action = TRANSITION_ACTION[target];
                  const transLabel = target === ProductStatus.OnSale ? t('products.list')
                    : target === ProductStatus.OffShelf ? t('products.delist')
                    : target === ProductStatus.Draft ? t('products.toDraft')
                    : te(`productStatus.${target}` as any);
                  return (
                    <Button
                      key={target}
                      variant={action.variant}
                      size="sm"
                      onClick={() => handleTransition(target)}
                    >
                      {transLabel}
                    </Button>
                  );
                })}
              {(publishProduct.txState.status !== 'idle' || unpublishProduct.txState.status !== 'idle') && (
                <TxStatusIndicator txState={publishProduct.txState.status !== 'idle' ? publishProduct.txState : unpublishProduct.txState} />
              )}
            </CardContent>
          </Card>
        </PermissionGuard>
      )}

      {/* Edit Form */}
      {canAct && (
        <PermissionGuard required={AdminPermission.SHOP_MANAGE} fallback={null}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('products.detail.editSection')}</CardTitle>
              <CardDescription>{t('products.detail.editDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <IpfsUploadField
                  id="edit-name"
                  label={t('products.productName')}
                  tip={t('help.productName')}
                  value={form.nameCid}
                  onChange={(cid) => setField('nameCid', cid)}
                />
                <IpfsUploadField
                  id="edit-image"
                  label={t('products.productImage')}
                  tip={t('help.productImage')}
                  value={form.imageCid}
                  onChange={(cid) => setField('imageCid', cid)}
                  accept="image/*"
                />
                <IpfsUploadField
                  id="edit-detail"
                  label={t('products.productDetail')}
                  tip={t('help.productDetail')}
                  value={form.detailCid}
                  onChange={(cid) => setField('detailCid', cid)}
                />

                {/* Pricing */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <LabelWithTip htmlFor="edit-usdt" tip={t('help.usdtPrice')}>{t('products.usdtPrice')}</LabelWithTip>
                    <Input
                      id="edit-usdt"
                      type="text"
                      inputMode="decimal"
                      value={form.priceUsdt}
                      onChange={(e) => setField('priceUsdt', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-nex">
                      {nexAutoCalc ? t('products.nexAutoCalc') : t('products.nexPrice')}
                    </Label>
                    {nexAutoCalc ? (
                      <>
                        <Input
                          id="edit-nex"
                          type="text"
                          value={autoNexDisplay}
                          readOnly
                          className="bg-muted"
                        />
                        {rateSource && (
                          <p className="text-xs text-muted-foreground">
                            {t('products.rateSource', { source: rateSource === 'twap' ? '1h TWAP' : rateSource === 'lastPrice' ? 'Last Price' : rateSource === 'lastTradePrice' ? 'Last Trade' : 'Initial Price' })}
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <Input
                          id="edit-nex"
                          type="text"
                          value={formatNexBalance(product.price)}
                          readOnly
                          className="bg-muted"
                        />
                        {usdtNum > 0 && !rateLoading && !usdtPerNex && (
                          <p className="text-xs text-amber-600">{t('products.nexManualFallback')}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Stock & Category & Visibility */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <LabelWithTip htmlFor="edit-stock" tip={t('help.stock')}>{t('products.stock')}</LabelWithTip>
                    <Input
                      id="edit-stock"
                      type="number"
                      min="0"
                      value={form.stock}
                      onChange={(e) => setField('stock', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <LabelWithTip htmlFor="edit-category" tip={t('help.category')}>{t('products.category')}</LabelWithTip>
                    <Select value={form.category} onValueChange={(v) => setField('category', v)}>
                      <SelectTrigger id="edit-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(ProductCategory).map((c) => (
                          <SelectItem key={c} value={c}>{te(`productCategory.${c}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <LabelWithTip htmlFor="edit-visibility" tip={t('help.visibility')}>{t('products.visibility')}</LabelWithTip>
                    <Select value={form.visibility} onValueChange={(v) => setField('visibility', v)}>
                      <SelectTrigger id="edit-visibility">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(ProductVisibility).map((v) => (
                          <SelectItem key={v} value={v}>{te(`productVisibility.${v}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Purchase quantity */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <LabelWithTip htmlFor="edit-min" tip={t('help.minQuantity')}>{t('products.minQuantity')}</LabelWithTip>
                    <Input
                      id="edit-min"
                      type="number"
                      min="1"
                      value={form.minQuantity}
                      onChange={(e) => setField('minQuantity', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <LabelWithTip htmlFor="edit-max" tip={t('help.maxQuantity')}>{t('products.maxQuantity')}</LabelWithTip>
                    <Input
                      id="edit-max"
                      type="number"
                      min="0"
                      value={form.maxQuantity}
                      onChange={(e) => setField('maxQuantity', e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={isBusy}>
                    {t('products.saveChanges')}
                  </Button>
                  <TxStatusIndicator txState={updateProduct.txState} />
                </div>
              </form>
            </CardContent>
          </Card>
        </PermissionGuard>
      )}

      {/* Danger Zone — Delete (only Draft / OffShelf) */}
      {canAct && canDelete && (
        <PermissionGuard required={AdminPermission.SHOP_MANAGE} fallback={null}>
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-lg text-destructive">{t('products.detail.dangerZone')}</CardTitle>
              <CardDescription>{t('products.detail.deleteDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                {t('products.deleteProduct')}
              </Button>
              {deleteProduct.txState.status !== 'idle' && (
                <TxStatusIndicator txState={deleteProduct.txState} />
              )}
            </CardContent>
          </Card>
        </PermissionGuard>
      )}

      {/* Delete confirm dialog */}
      <TxConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        config={deleteConfig}
      />
    </div>
  );
}
