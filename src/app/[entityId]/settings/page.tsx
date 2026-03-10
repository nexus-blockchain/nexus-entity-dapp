import dynamic from 'next/dynamic';

const SettingsPage = dynamic(() => import('./settings-client').then(m => m.SettingsPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <SettingsPage />;
}
