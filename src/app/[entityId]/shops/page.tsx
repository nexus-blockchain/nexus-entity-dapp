import dynamic from 'next/dynamic';

const ShopsPage = dynamic(() => import('./shops-client').then(m => m.ShopsPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <ShopsPage />;
}
