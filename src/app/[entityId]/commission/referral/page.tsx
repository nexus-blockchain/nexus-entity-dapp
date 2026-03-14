import dynamic from 'next/dynamic';

const ReferralPage = dynamic(() => import('./referral-client').then(m => m.ReferralPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <ReferralPage />;
}
