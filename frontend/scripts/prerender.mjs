// Build-time prerender. Runs after the client and SSR builds (see the
// `build` script in package.json) and turns the single SPA shell into one
// static HTML file per route, so "view source" shows real content and each
// page ships its own <title>, meta description, canonical, OG tags and
// JSON-LD. Also generates sitemap.xml and fails the build if a source map
// would be published.
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const ssrDir = join(root, 'dist-ssr');

const { render, renderHeadTags, ROUTES, SITE_URL } = await import(
  pathToFileURL(join(ssrDir, 'entry-server.js')).href
);

const template = readFileSync(join(dist, 'index.html'), 'utf-8');
const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const outputs = { home: 'index.html', dashboard: 'dashboard.html', notFound: '404.html' };

for (const [name, file] of Object.entries(outputs)) {
  const meta = ROUTES[name];
  const html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeText(meta.title)}</title>`)
    .replace('<!--seo-head-->', renderHeadTags(meta))
    .replace('<div id="root"></div>', `<div id="root">${render(meta.path)}</div>`);
  if (html === template) throw new Error(`prerender: template markers not found for ${name}`);
  writeFileSync(join(dist, file), html);
  console.log(`prerender: ${meta.path} -> dist/${file}`);
}

// sitemap.xml — every indexable route, stamped with the build date.
const lastmod = new Date().toISOString().slice(0, 10);
const urls = Object.values(ROUTES)
  .filter((r) => !r.noindex)
  .map((r) => `  <url>
    <loc>${SITE_URL}${r.path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${r.name === 'dashboard' ? 'daily' : 'weekly'}</changefreq>
    <priority>${r.path === '/' ? '1.0' : '0.8'}</priority>
  </url>`)
  .join('\n');
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
);
console.log('prerender: dist/sitemap.xml');

rmSync(ssrDir, { recursive: true, force: true });

// Guard: no source maps (or references to them) may ship to production.
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const leaks = walk(dist).filter(
  (p) => p.endsWith('.map') || (/\.(m?js|css)$/.test(p) && /[#@] sourceMappingURL=/.test(readFileSync(p, 'utf-8'))),
);
if (leaks.length) {
  console.error('prerender: source maps exposed in build output:\n  ' + leaks.join('\n  '));
  process.exit(1);
}
