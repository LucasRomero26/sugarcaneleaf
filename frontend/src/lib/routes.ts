// Single source of truth for per-page SEO metadata. Consumed by the client
// (document.title / meta updates on navigation) and by scripts/prerender.mjs,
// which bakes the same tags into each route's static HTML at build time.

export const SITE_URL = 'https://sugarcaneleaf.vercel.app';
export const SITE_NAME = 'SugarcaneLeaf';
export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const AUTHOR = 'Lucas Romero';
export const REPO_URL = 'https://github.com/LucasRomero26/sugarcaneleaf';

export type RouteName = 'home' | 'dashboard' | 'notFound';

export interface RouteMeta {
  name: RouteName;
  path: string;
  title: string;
  description: string;
  /** Excluded from sitemap and marked noindex (e.g. the 404 page). */
  noindex?: boolean;
  jsonLd: Record<string, unknown>[];
}

const breadcrumb = (items: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: it.name,
    item: `${SITE_URL}${it.path}`,
  })),
});

const HOME_DESCRIPTION =
  'Detect sugarcane leaf diseases in your browser: YOLO26m-seg runs client-side via LiteRT.js + WebGPU. 91.7% mAP@0.5 across 5 classes, no server roundtrip.';

export const ROUTES: Record<RouteName, RouteMeta> = {
  home: {
    name: 'home',
    path: '/',
    title: 'Sugarcane Leaf Disease Detection In-Browser | SugarcaneLeaf',
    description: HOME_DESCRIPTION,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Sugarcane Leaf Disease Detection',
        alternateName: SITE_NAME,
        url: `${SITE_URL}/`,
        description: HOME_DESCRIPTION,
        image: OG_IMAGE,
        applicationCategory: 'ScientificApplication',
        operatingSystem: 'Any (modern browser with WebGPU or WebAssembly)',
        browserRequirements: 'Requires JavaScript. WebGPU recommended; falls back to WebAssembly.',
        inLanguage: 'en',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        author: { '@type': 'Person', name: AUTHOR, url: 'https://github.com/LucasRomero26' },
        codeRepository: REPO_URL,
        featureList: [
          'Instance segmentation of foliar disease on sugarcane leaves',
          'Classes: healthy, mosaic, red rot, rust, yellow',
          'In-browser inference with LiteRT.js on WebGPU, ONNX Runtime Web fallback',
          'Webcam mode at 5 fps',
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        inLanguage: 'en',
      },
    ],
  },
  dashboard: {
    name: 'dashboard',
    path: '/dashboard',
    title: 'Live Inference Metrics Dashboard | SugarcaneLeaf',
    description:
      'Live latency metrics for in-browser sugarcane leaf disease detection: p50/p99 inference time, WebGPU vs WASM split, throughput and detected classes.',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Live Inference Metrics Dashboard',
        url: `${SITE_URL}/dashboard`,
        description:
          'Live latency metrics for in-browser sugarcane leaf disease detection: p50/p99 inference time, WebGPU vs WASM split, throughput and detected classes.',
        inLanguage: 'en',
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${SITE_URL}/` },
      },
      breadcrumb([
        { name: 'Home', path: '/' },
        { name: 'Dashboard', path: '/dashboard' },
      ]),
    ],
  },
  notFound: {
    name: 'notFound',
    path: '/404',
    title: 'Page Not Found (404) | SugarcaneLeaf',
    description: 'The page you are looking for does not exist. Go back to the sugarcane leaf disease detection demo or the live metrics dashboard.',
    noindex: true,
    jsonLd: [],
  },
};

export function matchRoute(pathname: string): RouteMeta {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/' || p === '/index.html') return ROUTES.home;
  if (p === '/dashboard') return ROUTES.dashboard;
  return ROUTES.notFound;
}
