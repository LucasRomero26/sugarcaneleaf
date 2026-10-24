import { Link } from './Link';

export function NotFound() {
  return (
    <section className="not-found">
      <p className="not-found-code" aria-hidden="true">404</p>
      <h1>Page not found</h1>
      <p className="not-found-text">
        This leaf doesn't exist. The page may have moved, or the link might be mistyped.
      </p>
      <div className="not-found-actions">
        <Link href="/" className="hero-cta">Back to the detector</Link>
        <Link href="/dashboard" className="cta-button">View metrics dashboard</Link>
      </div>
    </section>
  );
}
