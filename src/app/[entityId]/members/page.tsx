import dynamic from 'next/dynamic';

const MembersPage = dynamic(() => import('./members-client').then(m => m.MembersPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <MembersPage />;
}
