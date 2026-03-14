import dynamic from 'next/dynamic';

const SingleLinePage = dynamic(() => import('./singleline-client').then(m => m.SingleLinePage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <SingleLinePage />;
}
