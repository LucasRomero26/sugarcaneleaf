import http from 'k6/http';
import { check, sleep } from 'k6';

// Load test for the Sugarcane backend (Render free tier).
// Hits lightweight endpoints (/health, /metrics-summary) only — NOT /predict,
// because /predict runs YOLO server-side on a 512MB free-tier container and
// would saturate CPU, giving a misleading picture of the service's latency
// budget. The tradeoff the client-side LiteRT.js path avoids is exactly this
// CPU-bound server-side inference.
//
// Run: k6 run loadtest.js
// (or: /tmp/k6-v2.1.0-linux-amd64/k6 run loadtest.js)

const BASE_URL = __ENV.BASE_URL || 'https://sugarcane-backend-ql0e.onrender.com';

export const options = {
  vus: 5,            // 5 concurrent virtual users
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.05'],   // <5% errors
    http_req_duration: ['p(99)<5000'], // relax: free tier cold start can spike
  },
};

export default function () {
  // /health — fast HEAD-equivalent GET used by UptimeRobot too
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health 200': (r) => r.status === 200,
    'body has status ok': (r) => {
      try { return JSON.parse(r.body).status === 'ok'; }
      catch { return false; }
    },
  });

  // /metrics-summary — the dashboard's data source; exercises the
  // ring buffer + aggregation path on every request
  const metricsRes = http.get(`${BASE_URL}/metrics-summary`);
  check(metricsRes, {
    'metrics 200': (r) => r.status === 200,
    'body has count': (r) => {
      try { return Object.prototype.hasOwnProperty.call(JSON.parse(r.body), 'count'); }
      catch { return false; }
    },
  });

  sleep(0.2); // 200ms pacing — mimics a 5 req/s poll loop, close to real dashboard usage
}
