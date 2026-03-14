import dynamic from 'next/dynamic';

const TeamPage = dynamic(() => import('./team-client').then(m => m.TeamPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <TeamPage />;
}
