import type { YOLO, Results } from '@ultralytics/yolo';

let modelInstance: YOLO | null = null;
let loadPromise: Promise<YOLO> | null = null;

export async function loadModel(modelPath: string): Promise<YOLO> {
  if (modelInstance) return modelInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { default: YOLOClass } = await import('@ultralytics/yolo');
    modelInstance = await YOLOClass.load(modelPath, {
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
  })();

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
