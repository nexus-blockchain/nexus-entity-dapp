import dynamic from 'next/dynamic';

const LevelsPage = dynamic(() => import('./levels-client').then(m => m.LevelsPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <LevelsPage />;
}
