import dynamic from 'next/dynamic';

const TokenSalePage = dynamic(() => import('./tokensale-client').then(m => m.TokenSalePage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <TokenSalePage />;
}
