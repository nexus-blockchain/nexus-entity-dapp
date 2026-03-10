import dynamic from 'next/dynamic';

const ShopOrdersPage = dynamic(() => import('./shop-orders-client').then(m => m.ShopOrdersPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0', shopId: '0' }];
}

export default function Page() {
  return <ShopOrdersPage />;
}
