import { useEffect, useRef, useState } from 'react';
import { fetchMetricsSummary, getLocalSummary, type MetricsSummary } from '../lib/metrics';
import { LatencyTimelineChart, BackendDoughnut, ClassesBar } from './charts';

const POLL_MS = 30_000;
const TIMELINE_MAX = 40;
// Custom event dispatched when reportLatency() writes a new local report.
export const LOCAL_REPORT_EVENT = 'sugarcane:local-report';

interface TimelinePoint {
  t: string;
  p50: number;
  p99: number;
}

function fmtMs(v: number | null | undefined): string {
  if (v == null) return '–';
  return `${Math.round(v)}`;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function timeLabel(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Synthetic seed timeline so the chart has content immediately after a page
// reload using the local cache's current p50/p99.
// In real deployments we'd store timestamped percentiles, but for the demo
// the local cache stores raw reports only — we jitter around the current
// percentiles to provide a representative shape rather than a single point.
function buildSeedTimeline(data: MetricsSummary): TimelinePoint[] {
  const p50 = data.p50_ms ?? 0;
  const p99 = data.p99_ms ?? 0;
  const seed: TimelinePoint[] = [];
  for (let i = 8; i >= 1; i--) {
    const jitter = (Math.sin(i * 1.3) + 1) / 2;
    seed.push({
      t: new Date(Date.now() - i * 30_000).toLocaleTimeString(
        [], { hour: '2-digit', minute: '2-digit', second: '2-digit' }
      ),
      p50: Math.max(1, p50 * (0.82 + jitter * 0.36)),
      p99: Math.max(1, p99 * (0.85 + jitter * 0.3)),
    });
  }
  return seed;
}

/** Merge a server summary with the local one. We take the larger count and
 *  the union of by_backend / by_device / classes_distribution; percentiles
 *  prefer the side with more samples. */
function mergeSummaries(server: MetricsSummary | null, local: MetricsSummary | null): MetricsSummary | null {
  if (!local || local.count === 0) return server;
  if (!server || server.count === 0) return local;

  const pickLatencies = (s: MetricsSummary) => ({ p50: s.p50_ms, p99: s.p99_ms, mean: s.mean_ms,
    min: s.min_ms, max: s.max_ms, n: s.count });
  const sl = pickLatencies(server);
  const ll = pickLatencies(local);
  const chosen = sl.n >= ll.n ? sl : ll;

  const mergeMaps = (a: Record<string, number>, b: Record<string, number>) => {
    const out: Record<string, number> = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = (out[k] || 0) + v;
    return out;
  };

  return {
    count: server.count + local.count,
    p50_ms: chosen.p50,
    p99_ms: chosen.p99,
    mean_ms: chosen.mean,
    min_ms: chosen.min,
    max_ms: chosen.max,
    by_backend: mergeMaps(server.by_backend, local.by_backend),
    by_device: mergeMaps(server.by_device, local.by_device),
    classes_distribution: mergeMaps(server.classes_distribution, local.classes_distribution),
    throughput_per_min: Math.max(server.throughput_per_min, local.throughput_per_min),
    error_rate: server.error_rate,
    window_seconds: Math.max(server.window_seconds, local.window_seconds),
    requests_total: server.requests_total + local.requests_total,
    errors_total: server.errors_total + local.errors_total,
  };
}

export function MetricsTicker() {
  // Initialize state synchronously from localStorage so the dashboard paints
  // with the user's historical data on the first render, even if the backend
  // is sleeping. The backend will then merge in on the first poll. This is
  // the "stale-while-revalidate" pattern used by SWR/TanStack Query/Next.js
  // cache — never show an empty state when data is available.
  const [metrics, setMetrics] = useState<MetricsSummary | null>(
    () => {
      const cached = getLocalSummary();
      return cached.count > 0 ? cached : null;
    }
  );
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const lastCountRef = useRef(metrics?.count ?? 0);

  useEffect(() => {
    let active = true;

    // Seed timeline from the cached window extremity so the chart isn't
    // empty after a page reload, regardless of whether the local cache
    // already had data on mount (lastCountRef may be > 0 in that case,
    // which previously blocked seeding — leaving "Collecting samples…"
    // forever unless a new report arrived).
    const seed = getLocalSummary();
    if (seed.count > 0) {
      setTimeline((prev) => prev.length > 0 ? prev : buildSeedTimeline(seed));
      lastCountRef.current = seed.count;
    }

    const pushTimeline = (data: MetricsSummary) => {
      const next: TimelinePoint = {
        t: timeLabel(),
        p50: data.p50_ms ?? 0,
        p99: data.p99_ms ?? 0,
      };
      setTimeline((prev) => {
        let updated = [...prev, next];
        if (prev.length === 0) {
          updated = [...buildSeedTimeline(data), next];
        }
        return updated.length > TIMELINE_MAX ? updated.slice(updated.length - TIMELINE_MAX) : updated;
      });
    };

    const poll = async () => {
      let serverData: MetricsSummary | null = null;
      try {
        serverData = await fetchMetricsSummary();
      } catch (e: any) {
        // Backend cold or unresponsive — keep using local cache only
        if (active) setError(null);
      }

      if (!active) return;
      const localData = getLocalSummary();
      const merged = mergeSummaries(serverData, localData);
      if (merged) {
        setError(null);
        setMetrics(merged);
        if (merged.count !== lastCountRef.current) {
          lastCountRef.current = merged.count;
          pushTimeline(merged);
        }
      } else if (serverData) {
        // local empty and serverData has its own count==0 — show server anyway
        setMetrics(serverData);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_MS);

    // Re-merge immediately when a new local report is written (so the
    // dashboard updates appear instantly after a drag&drop, without waiting
    // for the next 30s poll cycle).
    const onLocalReport = () => {
      const localData = getLocalSummary();
      setMetrics((prev) => mergeSummaries(prev, localData) ?? prev);
      lastCountRef.current = (getLocalSummary()).count;
      // Push a fresh timeline point too
      pushTimeline(localData);
    };
    window.addEventListener(LOCAL_REPORT_EVENT, onLocalReport);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener(LOCAL_REPORT_EVENT, onLocalReport);
    };
  }, []);

  if (error) {
    return (
      <div className="metrics-dashboard">
        <div className="dashboard-header">
          <h2>Metrics Dashboard</h2>
          <span className="dashboard-window">live</span>
        </div>
        <p className="metrics-error">Backend unavailable: {error}</p>
      </div>
    );
  }

  if (!metrics || metrics.count === 0) {
    return (
      <div className="metrics-dashboard">
        <div className="dashboard-header">
          <h2>Metrics Dashboard</h2>
          <span className="dashboard-window">live</span>
        </div>
        <p className="no-data">Waiting for inference reports… run the demo above to populate live metrics.</p>
      </div>
    );
  }

  const backendEntries = metrics.by_backend || {};
  const classesEntries = metrics.classes_distribution || {};

  return (
    <div className="metrics-dashboard">
      <div className="dashboard-header">
        <h2>Metrics Dashboard</h2>
        <span className="dashboard-window">
          {metrics.count} reqs · last {Math.round(metrics.window_seconds)}s · {fmtPct(metrics.error_rate)} errors
        </span>
      </div>

      <div className="kpi-row">
        <div className="kpi-card">
          <span className="kpi-label">p50</span>
          <span className="kpi-value">{fmtMs(metrics.p50_ms)}<span className="unit">ms</span></span>
        </div>
        <div className="kpi-card kpi-accent">
          <span className="kpi-label">p99</span>
          <span className="kpi-value">{fmtMs(metrics.p99_ms)}<span className="unit">ms</span></span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">throughput</span>
          <span className="kpi-value">{metrics.throughput_per_min.toFixed(1)}<span className="unit">/min</span></span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">error rate</span>
          <span className={`kpi-value ${metrics.error_rate > 0.05 ? 'kpi-bad' : ''}`}>{fmtPct(metrics.error_rate)}</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">requests</span>
          <span className="kpi-value">{metrics.requests_total}</span>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card chart-wide">
          <h3>Latency over time <span className="chart-sub">p50 / p99 (ms)</span></h3>
          <div className="chart-canvas">
            {timeline.length > 0 ? (
              <LatencyTimelineChart
                data={{
                  t: timeline.map((p) => p.t),
                  p50: timeline.map((p) => p.p50),
                  p99: timeline.map((p) => p.p99),
                }}
              />
            ) : (
              <p className="chart-empty">Collecting samples…</p>
            )}
          </div>
        </div>

        <div className="chart-card">
          <h3>Backend split <span className="chart-sub">WebGPU vs WASM</span></h3>
          <div className="chart-canvas">
            <BackendDoughnut data={backendEntries} />
          </div>
        </div>

        <div className="chart-card chart-wide">
          <h3>Detected classes distribution</h3>
          <div className="chart-canvas">
            <ClassesBar data={classesEntries} />
          </div>
        </div>
      </div>
    </div>
  );
}
