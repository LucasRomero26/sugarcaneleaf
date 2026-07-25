const RELEASE_TAG = 'v1.0.0';
const RELEASE_ORIGIN =
  import.meta.env.VITE_MODEL_CDN ||
  'https://github.com/LucasRomero26/sugarcaneleaf/releases/download';

export const MODEL_PATH = `${RELEASE_ORIGIN}/${RELEASE_TAG}/Yolo26m-seg.tflite`;
export const FALLBACK_MODEL_PATH = `${RELEASE_ORIGIN}/${RELEASE_TAG}/Yolo26m-seg.onnx`;

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
