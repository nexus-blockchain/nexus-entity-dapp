#!/usr/bin/env node

/**
 * Post-build script for Tauri SPA fallback.
 *
 * Next.js `output: 'export'` only generates HTML for paths listed in
 * generateStaticParams (e.g. /0/). Since all [entityId] routes produce
 * identical HTML shells (ssr: false), we copy /0/index.html as the
 * fallback for any entityId the user navigates to.
 *
 * Tauri v2 serves `out/` as static files. When a path like /100000/
 * doesn't have a matching file, Tauri falls back to /index.html (if
 * configured) or 404s. This script creates a 200.html / 404.html
 * fallback at the root of out/.
 */

const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '../out');
const templateDir = path.join(outDir, '0');

if (!fs.existsSync(templateDir)) {
  console.log('[spa-fallback] No out/0/ directory found, skipping.');
  process.exit(0);
}

const templateIndex = path.join(templateDir, 'index.html');
if (!fs.existsSync(templateIndex)) {
  console.log('[spa-fallback] No out/0/index.html found, skipping.');
  process.exit(0);
}

// Copy as 404.html (common SPA fallback convention)
fs.copyFileSync(templateIndex, path.join(outDir, '404.html'));
console.log('[spa-fallback] Created out/404.html from out/0/index.html');

// Also copy as 200.html (used by some static hosts)
fs.copyFileSync(templateIndex, path.join(outDir, '200.html'));
console.log('[spa-fallback] Created out/200.html from out/0/index.html');
