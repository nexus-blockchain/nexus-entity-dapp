import dynamic from 'next/dynamic';

const BuyerOrdersPage = dynamic(() => import('./orders-client').then(m => m.BuyerOrdersPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <BuyerOrdersPage />;
}
