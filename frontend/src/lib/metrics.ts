import { API_URL } from './config';

export async function reportLatency(
  latencyMs: number,
  device: string,
  backend: string,
  classesDetected: string[]
): Promise<void> {
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
    console.warn('Failed to report latency:', e);
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
