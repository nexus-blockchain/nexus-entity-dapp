import dynamic from 'next/dynamic';

const CommissionPage = dynamic(() => import('./commission-client').then(m => m.CommissionPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <CommissionPage />;
}
