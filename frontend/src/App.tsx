import { useEffect, useState } from 'react';
import { DemoCanvas } from './components/DemoCanvas';
import { MetricsTicker } from './components/MetricsTicker';
import './App.css';

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#\/?/, ''));
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.replace(/^#\/?/, ''));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

// Animated count-up that runs once when the hero is shown. When the user
// leaves the hero (e.g. navigates to #/dashboard) we reset to 0 so coming
// back re-animates from scratch, instead of freezing at the stale value.
function useCountUp(shouldRun: boolean, target: number, duration = 1800) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!shouldRun) {
      setCount(0);
      return;
    }
    let raf = 0;
    let t0 = 0;
    const step = (ts: number) => {
      if (!t0) t0 = ts;
      const progress = Math.min((ts - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      setCount(Math.round(ease * target));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [shouldRun, target, duration]);
  // No ref/IntersectionObserver needed: the hero is above the fold on mount
  // and re-runs whenever shouldRun flips back to true.
  return { count };
}

export default function App() {
  const route = useHashRoute();
  const isDashboard = route === 'dashboard';
  const heroActive = !isDashboard;
  const { count: mapCount } = useCountUp(heroActive, 917, 2000);
  const { count: msCount } = useCountUp(heroActive, 47, 1500);

  return (
    <>
      <div className="animated-bg">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>
      
      <nav className="navbar">
        <a href="/" className="logo">
          Sugarcane<span>Leaf</span>
        </a>
        <div className="nav-links">
          <a href="#demo">Demo</a>
          <a href="#/dashboard">Dashboard</a>
          <a href="https://github.com/LucasRomero26/sugarcane" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </div>
      </nav>

      {isDashboard ? (
        <main className="dashboard-page">
          <section className="metrics-section">
            <MetricsTicker />
          </section>
        </main>
      ) : (
        <main>
          <section id="hero" className="hero">
            <div className="hero-left">
              <h1>Foliar Disease<br/>Detection<br/><span className="hero-highlight">in your browser.</span></h1>
              <p className="subtitle">
                YOLO26m-seg trained on 6,000+ field images of sugarcane leaves, exported to LiteRT
                and served entirely client-side via WebGPU — no server roundtrip for inference.
              </p>
              <a href="#demo" className="hero-cta">
                Try the Demo
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </a>
            </div>

            <div className="hero-right">
              <div className="stat-block stat-block-main">
                <div className="stat-block-number">{(mapCount / 10).toFixed(1)}<span className="stat-block-unit">%</span></div>
                <div className="stat-block-rule"></div>
                <div className="stat-block-label">mAP@0.5 Precision</div>
                <div className="stat-block-desc">Object detection accuracy measured across all confidence thresholds</div>
              </div>

              <div className="hero-right-row">
                <div className="stat-block stat-block-sm">
                  <div className="stat-block-number">5</div>
                  <div className="stat-block-rule"></div>
                  <div className="stat-block-label">Disease Classes</div>
                </div>
                <div className="stat-block stat-block-sm">
                  <div className="stat-block-number">~{msCount}<span className="stat-block-unit">ms</span></div>
                  <div className="stat-block-rule"></div>
                  <div className="stat-block-label">p99 Latency</div>
                  <div className="stat-block-desc">Typical on desktop GPU via WebGPU — measured live on your device in the dashboard</div>
                </div>
              </div>
            </div>
          </section>

          <section id="demo" className="demo-section">
            <DemoCanvas />
            
            <div className="demo-cta">
              <a href="#/dashboard" className="cta-button">
                View Full Metrics Dashboard
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </a>
            </div>
          </section>
        </main>
      )}

      <footer>
        <p>© 2026 Lucas Romero — Sugarcane Leaf Disease Detection</p>
      </footer>
    </>
  );
}
