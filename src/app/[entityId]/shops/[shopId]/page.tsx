import dynamic from 'next/dynamic';

const ShopDetailPage = dynamic(() => import('./shop-detail-client').then(m => m.ShopDetailPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0', shopId: '0' }];
}

export default function Page() {
  return <ShopDetailPage />;
}
