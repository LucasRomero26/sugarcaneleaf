import { useEffect, useRef, useState, useCallback } from 'react';
import type { YOLO, Results } from '@ultralytics/yolo';
import { loadModel, runInference, freeModel, type LoadProgress } from '../lib/yolo';
import { isModelCached } from '../lib/modelCache';
import { reportLatency } from '../lib/metrics';
import { WebGPUStatus, type ModelState } from './WebGPUStatus';
import { classColors, yoloClasses, prettyClass, MODEL_PATH, FALLBACK_MODEL_PATH } from '../lib/config';

const CONF_THRESHOLD = 0.5;
const WEBCAM_FPS = 5;
const WEBCAM_INTERVAL_MS = 1000 / WEBCAM_FPS;

const fmtMB = (bytes: number) => (bytes / 1e6).toFixed(1);

function ModelProgress({ progress }: { progress: LoadProgress | null }) {
  const downloading = progress?.phase === 'download';
  const pct = downloading && progress.total ? Math.min(100, (progress.loaded / progress.total) * 100) : null;

  let label = 'Preparing model…';
  let detail = 'Reading the cached model from this device';
  if (downloading) {
    label = 'Downloading YOLO26m-seg model…';
    detail = progress.total
      ? `${fmtMB(progress.loaded)} / ${fmtMB(progress.total)} MB · first time only, then cached on this device`
      : `${fmtMB(progress.loaded)} MB · first time only, then cached on this device`;
  } else if (progress?.phase === 'init') {
    label = 'Initializing model…';
    detail = 'Compiling for WebGPU (or WASM) on your device';
  }

  return (
    <div className="loading-placeholder">
      <p>{label}</p>
      <div
        className={`progress ${pct == null ? 'progress-indeterminate' : ''}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct == null ? undefined : Math.round(pct)}
      >
        <div className="progress-fill" style={pct == null ? undefined : { width: `${pct}%` }} />
      </div>
      <span className="hint">
        {pct != null && <strong>{Math.floor(pct)}% · </strong>}
        {detail}
      </span>
    </div>
  );
}

export function DemoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const webcamIntervalRef = useRef<number | null>(null);

  // The model is NOT loaded on mount: it is fetched (or read from the Cache
  // API) the first time the user uploads an image or starts the webcam.
  const modelRef = useRef<YOLO | null>(null);
  const fallbackRef = useRef(false);
  const [modelState, setModelState] = useState<ModelState>('idle');
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [cached, setCached] = useState<boolean | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  const [predicting, setPredicting] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Webcam mode state
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const webcamPredictingRef = useRef(false);

  const loadingModel = modelState === 'loading';

  // Only checks whether the weights are already on disk (no body is read),
  // to tell the user if the first run will need a download.
  useEffect(() => {
    let cancelled = false;
    isModelCached(MODEL_PATH).then((hit) => { if (!cancelled) setCached(hit); });
    return () => { cancelled = true; };
  }, []);

  const ensureModel = useCallback(async (): Promise<YOLO | null> => {
    if (modelRef.current) return modelRef.current;
    setModelState('loading');
    setProgress(null);
    let m: YOLO;
    try {
      m = await loadModel(MODEL_PATH, setProgress);
    } catch (e: any) {
      console.warn('LiteRT load failed, trying ONNX fallback:', e);
      freeModel();
      try {
        setProgress(null);
        m = await loadModel(FALLBACK_MODEL_PATH, setProgress);
        fallbackRef.current = true;
        setUseFallback(true);
      } catch (e2: any) {
        setError(`Failed to load model: ${e2.message}`);
        setModelState('error');
        setProgress(null);
        return null;
      }
    }
    modelRef.current = m;
    setDevice(m.device);
    setModelState('ready');
    setProgress(null);
    setCached(true);
    return m;
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (loadingModel || predicting) return;
    setError(null);
    setResults(null);
    setLatency(null);

    const model = await ensureModel();
    if (!model) return;
    setPredicting(true);

    try {
      const url = URL.createObjectURL(file);
      setImageUrl(url);

      const img = new Image();
      img.src = url;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });
      imageRef.current = img;

      const t0 = performance.now();
      const res = await runInference(model, img, CONF_THRESHOLD);
      const totalMs = performance.now() - t0;
      setLatency(totalMs);
      setResults(res);

      if (canvasRef.current && imageRef.current) {
        const { annotate } = await import('@ultralytics/yolo');
        await annotate(canvasRef.current, img, res, { labels: true });
      }

      const classesDetected = res.boxes.map((b) => b.name);
      await reportLatency(totalMs, model.device, fallbackRef.current ? 'ort_web' : 'litert_js', classesDetected);
    } catch (e: any) {
      setError(`Inference error: ${e.message}`);
    } finally {
      setPredicting(false);
    }
  }, [ensureModel, loadingModel, predicting]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Reset value so picking the same file twice re-triggers onChange
      e.target.value = '';
      handleFile(file);
    }
  };

  const resetToUpload = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setResults(null);
    setLatency(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (webcamIntervalRef.current != null) {
      clearInterval(webcamIntervalRef.current);
      webcamIntervalRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setWebcamActive(false);
    webcamPredictingRef.current = false;
    setResults(null);
    setLatency(null);
  }, []);

  const startWebcam = useCallback(async () => {
    setWebcamError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setWebcamError('Webcam not supported in this browser.');
      return;
    }

    const model = await ensureModel();
    if (!model) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      setWebcamActive(true);

      // Defer video element binding to next tick so it's rendered
      requestAnimationFrame(() => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => videoRef.current?.play();

        // 5fps inference loop over the live video frame
        webcamIntervalRef.current = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          if (webcamPredictingRef.current) return; // skip if last frame still running
          webcamPredictingRef.current = true;
          try {
            const t0 = performance.now();
            const res = await runInference(model, videoRef.current, CONF_THRESHOLD);
            const totalMs = performance.now() - t0;
            setLatency(totalMs);
            setResults(res);

            if (canvasRef.current) {
              const { annotate } = await import('@ultralytics/yolo');
              await annotate(canvasRef.current, videoRef.current, res, { labels: true });
            }

            const classesDetected = res.boxes.map((b) => b.name);
            await reportLatency(totalMs, model.device, fallbackRef.current ? 'ort_web' : 'litert_js', classesDetected);
          } catch (e: any) {
            console.warn('webcam inference tick failed:', e);
          } finally {
            webcamPredictingRef.current = false;
          }
        }, WEBCAM_INTERVAL_MS);
      });
    } catch (e: any) {
      const name = e?.name ?? '';
      if (name === 'NotAllowedError') setWebcamError('Camera permission denied.');
      else if (name === 'NotFoundError') setWebcamError('No camera found.');
      else setWebcamError(`Webcam error: ${e.message ?? e}`);
      setWebcamActive(false);
    }
  }, [ensureModel]);

  // Release camera + interval on unmount (e.g. navigating to /dashboard)
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (webcamIntervalRef.current != null) {
        clearInterval(webcamIntervalRef.current);
      }
    };
  }, []);

  const detectionList = results?.boxes?.map((b, i) => (
    <div key={i} className="detection-item">
      <span className="det-color" style={{ background: classColors[b.name] || '#888' }} />
      <span className="det-name">{prettyClass(b.name)}</span>
      <span className="det-conf">{(b.conf * 100).toFixed(1)}%</span>
    </div>
  )) ?? [];

  return (
    <div className="demo-container">
      <div className="demo-header">
        <h2>Sugarcane Leaf Disease Detection</h2>
        <WebGPUStatus device={device} state={modelState} />
        {useFallback && <div className="badge badge-fallback">ONNX fallback</div>}
      </div>

      {loadingModel ? (
        <div className="drop-zone drop-zone-loading">
          <ModelProgress progress={progress} />
        </div>
      ) : (
        <div
          className="drop-zone"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !imageUrl && !webcamActive && fileInputRef.current?.click()}
        >
          {webcamActive ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                aria-label="Live webcam feed of the sugarcane leaf being analyzed"
                className="webcam-layer"
                style={{ zIndex: 1 }}
              />
              <canvas
                ref={canvasRef}
                role="img"
                aria-label="Disease segmentation masks and labels drawn over the webcam feed"
                className="webcam-layer"
                style={{ zIndex: 2, pointerEvents: 'none' }}
              />
            </>
          ) : imageUrl ? (
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={results ? `Uploaded sugarcane leaf with detected regions: ${results.boxes.map((b) => prettyClass(b.name)).join(', ') || 'no disease detected'}` : 'Uploaded sugarcane leaf image'}
              className="result-canvas"
            />
          ) : (
            <div className="drop-placeholder">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p>Drag & drop a leaf image or click to upload</p>
              <span className="hint">JPEG, PNG, or WebP — max 10MB</span>
              {cached === false && (
                <span className="hint">The ~94MB model downloads on first use, then stays cached on this device</span>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            aria-label="Upload a sugarcane leaf image"
            accept="image/*"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {!loadingModel && (
        <div className="result-actions">
          {webcamActive ? (
            <button
              type="button"
              className="btn-secondary active"
              onClick={stopWebcam}
            >
              Stop webcam
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={startWebcam}
              >
                Webcam mode
              </button>
              {imageUrl && !predicting && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={resetToUpload}
                >
                  Try another image
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="demo-footer">
        <div className="detections-panel">
          <h3>Detections {latency && <span className="latency">{latency.toFixed(0)}ms</span>}</h3>
          {detectionList.length > 0 ? (
            <div className="detection-list">{detectionList}</div>
          ) : (
            <p className="no-detections">
              {predicting ? 'Running inference…' :
               loadingModel ? 'Waiting for model to finish loading…' :
               'No detections yet. Upload an image.'}
            </p>
          )}
          {error && <div className="error">{error}</div>}
          {webcamError && <div className="error">{webcamError}</div>}
        </div>

        <div className="classes-legend">
          <h3>Classes</h3>
          <div className="legend-items">
            {Object.values(yoloClasses).map((name) => (
              <div key={name} className="legend-item">
                <span className="det-color" style={{ background: classColors[name] || '#888' }} />
                {prettyClass(name)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
