import dynamic from 'next/dynamic';

const MultiLevelPage = dynamic(() => import('./multilevel-client').then(m => m.MultiLevelPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <MultiLevelPage />;
}
