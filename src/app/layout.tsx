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

export const metadata: Metadata = {
  title: "NEXUS Entity dApp",
  description: "NEXUS Entity standalone dApp",
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
