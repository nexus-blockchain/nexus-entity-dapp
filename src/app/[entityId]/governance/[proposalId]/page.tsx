import dynamic from 'next/dynamic';

const ProposalDetailPage = dynamic(() => import('./proposal-detail-client').then(m => m.ProposalDetailPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0', proposalId: '0' }];
}

export default function Page() {
  return <ProposalDetailPage />;
}
