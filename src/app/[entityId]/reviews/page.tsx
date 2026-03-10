import dynamic from 'next/dynamic';

const ReviewsPage = dynamic(() => import('./reviews-client').then(m => m.ReviewsPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0' }];
}

export default function Page() {
  return <ReviewsPage />;
}
