import dynamic from 'next/dynamic';

const ProductDetailPage = dynamic(() => import('./product-detail-client').then(m => m.ProductDetailPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0', shopId: '0', productId: '0' }];
}

export default function Page() {
  return <ProductDetailPage />;
}
