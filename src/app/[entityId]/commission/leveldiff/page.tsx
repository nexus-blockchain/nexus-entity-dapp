import dynamic from 'next/dynamic';

const LevelDiffPage = dynamic(() => import('./leveldiff-client').then(m => m.LevelDiffPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <LevelDiffPage />;
}
