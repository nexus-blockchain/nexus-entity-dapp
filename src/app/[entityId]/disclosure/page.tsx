import dynamic from 'next/dynamic';

const DisclosurePage = dynamic(() => import('./disclosure-client').then(m => m.DisclosurePage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <DisclosurePage />;
}
