import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';

export { renderHeadTags } from './lib/head';
export { ROUTES, SITE_URL } from './lib/routes';

/** Build-time only: renders a route to static HTML (see scripts/prerender.mjs). */
export function render(path: string): string {
  return renderToString(createElement(App, { initialPath: path }));
}
