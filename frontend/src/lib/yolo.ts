import type { YOLO, Results } from '@ultralytics/yolo';
import { fetchModelCached } from './modelCache';

let modelInstance: YOLO | null = null;
let loadPromise: Promise<YOLO> | null = null;

export type LoadProgress =
  | { phase: 'download'; loaded: number; total: number | null }
  | { phase: 'init' };

// LiteRT's wasm runtime (TFLite/abseil logging) writes INFO/WARNING lines to
// stderr, which emscripten routes to console.error: ~17 entries per load such
// as "INFO: [accelerator_registry.cc] ..." and "WARNING: NPU accelerator could
// not be loaded" (there is no NPU delegate on the web). LiteRT.js passes
// `self.Module` to its emscripten factory, and pthread workers proxy their
// print/printErr back to the main thread's handlers, so filtering here covers
// every thread. Glog-style info lines ("I1025 01:41:31 delegate_webgpu.cc...")
// are dropped too. Real warnings and errors still reach the console.
const LITERT_NOISE = /^(INFO|VERBOSE|DEBUG): |^[IV]\d{4} |NPU accelerator could not be loaded/;

function filterLiteRtLogs(): void {
  const forward = (stderr: boolean) => (...args: unknown[]) => {
    const line = String(args[0] ?? '');
    if (LITERT_NOISE.test(line)) return;
    if (!stderr) console.log(...args);
    else if (line.startsWith('WARNING: ')) console.warn(...args);
    else console.error(...args);
  };
  (self as unknown as { Module?: object }).Module = { print: forward(false), printErr: forward(true) };
}

export async function loadModel(modelPath: string, onProgress?: (p: LoadProgress) => void): Promise<YOLO> {
  if (modelInstance) return modelInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const bytes = await fetchModelCached(modelPath, (p) => onProgress?.({ phase: 'download', ...p }));
    onProgress?.({ phase: 'init' });
    filterLiteRtLogs();
    const { default: YOLOClass } = await import('@ultralytics/yolo');
    // Raw bytes: the backend is picked by sniffing the TFLite magic, so the
    // same call handles both .tflite (LiteRT.js) and .onnx (ort-web).
    modelInstance = await YOLOClass.load(bytes, {
      device: 'auto',
      // Self-host the LiteRT.js wasm assets at /litert/ so the Web Workers
      // LiteRT spawns (for threaded wasm) and the wasm downloads are
      // same-origin. Loading them cross-origin (e.g. from jsDelivr) breaks
      // under our COEP=require-corp headers — workers refused to spawn and
      // wasm fetches failed CORP validation. The 38MB of files (8 binaries)
      // live in frontend/public/litert/ and get served by Vercel.
      litertWasmUrl: '/litert/',
    });
    return modelInstance;
  })().catch((e) => {
    // Let the next call (e.g. the ONNX fallback, or a retry) start over.
    loadPromise = null;
    throw e;
  });

  return loadPromise;
}

export async function runInference(
  model: YOLO,
  image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap,
  conf: number = 0.5
): Promise<Results> {
  return model.predict(image, { conf, iou: 0.7 });
}

export function getDevice(model: YOLO): string {
  return model.device;
}

export function freeModel(): void {
  if (modelInstance) {
    modelInstance.free();
    modelInstance = null;
    loadPromise = null;
  }
}

export async function detectWebGPU(): Promise<boolean> {
  if (!('gpu' in navigator)) return false;
  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}
