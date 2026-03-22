import dynamic from 'next/dynamic';

const SalesOrdersPage = dynamic(() => import('./orders-client').then(m => m.SalesOrdersPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <SalesOrdersPage />;
}
