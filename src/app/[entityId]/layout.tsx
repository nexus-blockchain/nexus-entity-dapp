import dynamic from 'next/dynamic';

const EntityLayoutClient = dynamic(
  () => import('./layout-client').then((m) => m.EntityLayoutClient),
  { ssr: false },
);

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function EntityLayout({
  params,
  children,
}: {
  params: { entityId: string };
  children: React.ReactNode;
}) {
  return <EntityLayoutClient params={params}>{children}</EntityLayoutClient>;
}
