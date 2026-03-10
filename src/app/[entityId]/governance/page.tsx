import dynamic from 'next/dynamic';

const GovernancePage = dynamic(() => import('./governance-client').then(m => m.GovernancePage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <GovernancePage />;
}
