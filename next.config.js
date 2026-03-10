/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only enable static export for production builds (Tauri).
  // In dev mode, skip 'export' to avoid generateStaticParams strict validation.
  ...(process.env.NODE_ENV === 'production' ? { output: 'export' } : {}),
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

module.exports = nextConfig;
