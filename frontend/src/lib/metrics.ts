import { API_URL } from './config';

// ---- Local persisted metrics (localStorage-backed) ---------------------
// The backend ring-buffer holds only the last 1000 requests and resets when
// Render's free tier spins the service down (which it does after ~15min of
// idle and again daily). To keep the dashboard meaningful across visits and
// cold starts, we mirror every report into localStorage with a 24h TTL. The
// dashboard merges server-side metrics with the local view so a reviewer
// always sees their own usage history even if the backend just woke up.

const LOCAL_KEY = 'sugarcane:metrics:v1';
const LOCAL_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface LocalReport {
  ts: number;
  latency_ms: number;
  device: string;
  backend: string;
  classes_detected: string[];
}

function readLocal(): LocalReport[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as LocalReport[];
    const cutoff = Date.now() - LOCAL_TTL_MS;
    return arr.filter((r) => r.ts >= cutoff);
  } catch {
    return [];
  }
}

function writeLocal(reports: LocalReport[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(reports));
  } catch {
    // QuotaExceeded — drop oldest to make room
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(reports.slice(-200)));
    } catch {
      // give up silently; dashboard will rely on backend only
    }
  }
}

export function getLocalReports(): LocalReport[] {
  return readLocal();
}

export function clearLocalReports(): void {
  try { localStorage.removeItem(LOCAL_KEY); } catch {}
}

function recordLocal(
  latencyMs: number,
  device: string,
  backend: string,
  classesDetected: string[]
): void {
  const reports = readLocal();
  reports.push({
    ts: Date.now(),
    latency_ms: latencyMs,
    device,
    backend,
    classes_detected: classesDetected,
  });
  // Cap to last 500 entries (~one drag&drop per 30s for 4h of demoing)
  writeLocal(reports.slice(-500));
}

/** Compute an aggregated summary purely from the locally cached reports.
 *  Mirrors the shape of the server-side MetricsSummary so the dashboard
 *  can swap them transparently. */
export function getLocalSummary(): MetricsSummary {
  const reports = readLocal();
  const count = reports.length;
  if (count === 0) {
    return {
      count: 0, p50_ms: null, p99_ms: null, mean_ms: null,
      min_ms: null, max_ms: null,
      by_backend: {}, by_device: {},
      classes_distribution: {}, throughput_per_min: 0, error_rate: 0,
      window_seconds: 0, requests_total: 0, errors_total: 0,
    };
  }
  const lats = reports.map(r => r.latency_ms).sort((a, b) => a - b);
  const sum = lats.reduce((a, b) => a + b, 0);
  const p = (q: number) => lats[Math.min(lats.length - 1, Math.floor(q * lats.length))];
  const byBackend: Record<string, number> = {};
  const byDevice: Record<string, number> = {};
  const classesDist: Record<string, number> = {};
  for (const r of reports) {
    byBackend[r.backend] = (byBackend[r.backend] || 0) + 1;
    byDevice[r.device] = (byDevice[r.device] || 0) + 1;
    for (const c of r.classes_detected) {
      classesDist[c] = (classesDist[c] || 0) + 1;
    }
  }
  const window_ms = Math.max(1000,
    reports[count - 1].ts - reports[0].ts);
  const throughput = (count / (window_ms / 60000)) || 0;
  return {
    count,
    p50_ms: p(0.5),
    p99_ms: p(0.99),
    mean_ms: sum / count,
    min_ms: lats[0],
    max_ms: lats[lats.length - 1],
    by_backend: byBackend,
    by_device: byDevice,
    classes_distribution: classesDist,
    throughput_per_min: throughput,
    error_rate: 0,
    window_seconds: Math.round(window_ms / 1000),
    requests_total: count,
    errors_total: 0,
  };
}

// ---- Backend reporting -----------------------------------------------

export async function reportLatency(
  latencyMs: number,
  device: string,
  backend: string,
  classesDetected: string[]
): Promise<void> {
  // Always record locally first so the dashboard stays consistent across
  // cold-starts / page reloads (the server ring-buffer is ephemeral).
  recordLocal(latencyMs, device, backend, classesDetected);

  // Notify any listening dashboard that a new point was just added, so it
  // can re-merge immediately without waiting for the next 30s poll.
  try {
    window.dispatchEvent(new CustomEvent('sugarcane:local-report'));
  } catch {}

  // Then fire-and-forget to the backend (best-effort; swallowed on failure).
  try {
    await fetch(`${API_URL}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latency_ms: latencyMs,
        device,
        backend,
        classes_detected: classesDetected,
      }),
    });
  } catch (e) {
    console.warn('Failed to report latency to backend:', e);
  }
}

export interface MetricsSummary {
  count: number;
  p50_ms: number | null;
  p99_ms: number | null;
  mean_ms: number | null;
  min_ms: number | null;
  max_ms: number | null;
  by_backend: Record<string, number>;
  by_device: Record<string, number>;
  classes_distribution: Record<string, number>;
  throughput_per_min: number;
  error_rate: number;
  window_seconds: number;
  requests_total: number;
  errors_total: number;
}

export async function fetchMetricsSummary(): Promise<MetricsSummary> {
  const res = await fetch(`${API_URL}/metrics-summary`);
  if (!res.ok) throw new Error(`Metrics fetch failed: ${res.status}`);
  return res.json();
}
