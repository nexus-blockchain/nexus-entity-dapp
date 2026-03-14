import dynamic from 'next/dynamic';

const PoolRewardPage = dynamic(() => import('./poolreward-client').then(m => m.PoolRewardPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <PoolRewardPage />;
}
