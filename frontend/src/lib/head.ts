import { OG_IMAGE, SITE_NAME, SITE_URL, type RouteMeta } from './routes';

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// `<` is escaped so a string value can never close the <script> element.
const jsonLd = (obj: unknown) => JSON.stringify(obj).replace(/</g, '\\u003c');

/** Route-specific <head> tags, without <title>. Every tag carries
 *  `data-seo` so the client can swap the whole set on navigation. */
export function renderHeadTags(meta: RouteMeta): string {
  const url = `${SITE_URL}${meta.path === '/' ? '/' : meta.path}`;
  const t = escapeAttr(meta.title);
  const d = escapeAttr(meta.description);
  const tags = [
    `<meta data-seo name="description" content="${d}" />`,
    `<meta data-seo name="robots" content="${meta.noindex ? 'noindex, follow' : 'index, follow'}" />`,
    // The 404 page has no canonical URL of its own (it is served for any path).
    meta.noindex ? '' : `<link data-seo rel="canonical" href="${url}" />`,
    `<meta data-seo property="og:type" content="website" />`,
    `<meta data-seo property="og:site_name" content="${SITE_NAME}" />`,
    `<meta data-seo property="og:locale" content="en_US" />`,
    `<meta data-seo property="og:title" content="${t}" />`,
    `<meta data-seo property="og:description" content="${d}" />`,
    meta.noindex ? '' : `<meta data-seo property="og:url" content="${url}" />`,
    `<meta data-seo property="og:image" content="${OG_IMAGE}" />`,
    `<meta data-seo property="og:image:type" content="image/png" />`,
    `<meta data-seo property="og:image:width" content="1200" />`,
    `<meta data-seo property="og:image:height" content="630" />`,
    `<meta data-seo property="og:image:alt" content="SugarcaneLeaf: foliar disease detection in your browser with YOLO26m-seg, 91.7% mAP@0.5 across 5 disease classes" />`,
    `<meta data-seo name="twitter:card" content="summary_large_image" />`,
    `<meta data-seo name="twitter:title" content="${t}" />`,
    `<meta data-seo name="twitter:description" content="${d}" />`,
    `<meta data-seo name="twitter:image" content="${OG_IMAGE}" />`,
    ...meta.jsonLd.map((obj) => `<script data-seo type="application/ld+json">${jsonLd(obj)}</script>`),
  ];
  return tags.filter(Boolean).join('\n    ');
}

/** Client-side counterpart of the prerendered head: keeps title, description,
 *  canonical, OG and JSON-LD in sync after in-app navigation. */
export function applyHead(meta: RouteMeta): void {
  document.title = meta.title;
  document.head.querySelectorAll('[data-seo]').forEach((el) => el.remove());
  document.head.insertAdjacentHTML('beforeend', renderHeadTags(meta));
}
