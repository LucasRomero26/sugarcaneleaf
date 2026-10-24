import type { MouseEvent, ReactNode } from 'react';
import { navigate } from '../lib/router';

/** In-app link: client-side navigation across pages; same-page anchors and
 *  modified clicks (new tab, etc.) keep the browser's default behaviour. */
export function Link({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (new URL(href, window.location.href).pathname === window.location.pathname) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} className={className} onClick={onClick}>{children}</a>;
}
