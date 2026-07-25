// Model weights are hosted on a CDN that serves `Access-Control-Allow-Origin: *`
// (required for cross-origin fetch from the browser). GitHub Releases assets do
// NOT send CORS headers, so we use HuggingFace Hub instead. Override via
// VITE_MODEL_CDN if you need to migrate (e.g. Cloudflare R2 custom domain).
const MODEL_CDN =
  import.meta.env.VITE_MODEL_CDN ||
  'https://huggingface.co/sacwaves/sugarcaneleaf/resolve/main';

export const MODEL_PATH = `${MODEL_CDN}/Yolo26m-seg.tflite`;
export const FALLBACK_MODEL_PATH = `${MODEL_CDN}/Yolo26m-seg.onnx`;

export const yoloClasses: Record<number, string> = {
  0: 'healthy',
  1: 'mosaic',
  2: 'red_rot',
  3: 'rust',
  4: 'yellow',
};

export const classColors: Record<string, string> = {
  healthy: '#22c55e',
  mosaic: '#a855f7',
  red_rot: '#ef4444',
  rust: '#f97316',
  yellow: '#eab308',
};

export function prettyClass(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
