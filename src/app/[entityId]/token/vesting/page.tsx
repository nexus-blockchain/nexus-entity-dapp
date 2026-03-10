import dynamic from 'next/dynamic';

const VestingPage = dynamic(() => import('./vesting-client').then(m => m.VestingPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <VestingPage />;
}
