import dynamic from 'next/dynamic';

const ProductsPage = dynamic(() => import('./products-client').then(m => m.ProductsPage), { ssr: false });

export function generateStaticParams() {
  return [{ entityId: '0', shopId: '0' }];
}

export default function Page() {
  return <ProductsPage />;
}
