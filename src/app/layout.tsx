import type { Metadata } from "next";
import "@/styles/globals.css";
import dynamic from "next/dynamic";

const Providers = dynamic(() => import("./providers").then((mod) => mod.Providers), {
  ssr: false,
});
const Toaster = dynamic(
  () => import("@/components/ui/toaster").then((mod) => mod.Toaster),
  { ssr: false },
);

const FAVICON_DATA =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%236366f1'/%3E%3Ctext x='16' y='22' font-size='16' text-anchor='middle' fill='white' font-family='sans-serif'%3EN%3C/text%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: "NEXUS Entity dApp",
  description: "NEXUS Entity standalone dApp",
  icons: { icon: FAVICON_DATA },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
