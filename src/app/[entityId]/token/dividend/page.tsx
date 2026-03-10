import dynamic from 'next/dynamic';

const DividendPage = dynamic(() => import('./dividend-client').then(m => m.DividendPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <DividendPage />;
}
