import dynamic from 'next/dynamic';

const ReferralsPage = dynamic(() => import('./referrals-client').then(m => m.ReferralsPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <ReferralsPage />;
}
