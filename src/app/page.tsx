import dynamic from 'next/dynamic';

const HomePage = dynamic(() => import('./home-client').then((mod) => mod.HomePage), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  ),
});

export default function Page() {
  return <HomePage />;
}
