import dynamic from 'next/dynamic';

const KycPage = dynamic(() => import('./kyc-client').then(m => m.KycPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <KycPage />;
}
