import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Social crawlers ignore relative image URLs, so %SITE_URL% in index.html becomes the site's origin.
// Netlify sets URL (main site address) during builds; SITE_URL overrides it, e.g. for a custom domain.
const siteUrl = (process.env.SITE_URL || process.env.URL || '').replace(/\/$/, '');

const siteUrlPlugin = () => ({
  name: 'vslab-site-url',
  transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl || '.'),
});

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [react(), siteUrlPlugin()],
  // Shown in the footer and settings menu (see src/version.js).
  define: { __APP_VERSION__: JSON.stringify(version) },
  base: './',
});
