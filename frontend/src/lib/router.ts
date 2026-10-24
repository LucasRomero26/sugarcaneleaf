import { useEffect, useState } from 'react';

// Minimal History-API router. Real paths (instead of the old `#/dashboard`)
// give every page its own crawlable URL, title, canonical and prerendered
// HTML. `initialPath` is how the build-time prerender picks the route.

export function navigate(href: string): void {
  window.history.pushState(null, '', href);
  // pushState doesn't fire popstate; emit one so usePath() re-reads the URL.
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function usePath(initialPath: string): string {
  const [path, setPath] = useState(() =>
    typeof window === 'undefined' ? initialPath : window.location.pathname,
  );

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return path;
}
