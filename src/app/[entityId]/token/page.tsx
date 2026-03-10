import dynamic from 'next/dynamic';

const TokenPage = dynamic(() => import('./token-client').then(m => m.TokenPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <TokenPage />;
}
