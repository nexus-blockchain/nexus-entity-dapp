import dynamic from 'next/dynamic';

const MarketPage = dynamic(() => import('./market-client').then(m => m.MarketPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <MarketPage />;
}
