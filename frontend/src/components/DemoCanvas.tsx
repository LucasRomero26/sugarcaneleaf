import { useEffect, useRef, useState, useCallback } from 'react';
import type { YOLO, Results } from '@ultralytics/yolo';
import { loadModel, runInference, freeModel } from '../lib/yolo';
import { reportLatency } from '../lib/metrics';
import { WebGPUStatus } from './WebGPUStatus';
import { classColors, yoloClasses, prettyClass, MODEL_PATH, FALLBACK_MODEL_PATH } from '../lib/config';

const CONF_THRESHOLD = 0.5;
const WEBCAM_FPS = 5;
const WEBCAM_INTERVAL_MS = 1000 / WEBCAM_FPS;

export function DemoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const webcamIntervalRef = useRef<number | null>(null);

  const [model, setModel] = useState<YOLO | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  // Webcam mode state
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const webcamPredictingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await loadModel(MODEL_PATH);
        if (cancelled) return;
        setModel(m);
        setDevice(m.device);
        setLoading(false);
      } catch (e: any) {
        console.warn('LiteRT load failed, trying ONNX fallback:', e);
        freeModel();
        try {
          const m = await loadModel(FALLBACK_MODEL_PATH);
          if (cancelled) return;
          setModel(m);
          setDevice(m.device);
          setUseFallback(true);
          setLoading(false);
        } catch (e2: any) {
          if (cancelled) return;
          setError(`Failed to load model: ${e2.message}`);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!model) return;
    setPredicting(true);
    setError(null);

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
      await reportLatency(totalMs, model.device, useFallback ? 'ort_web' : 'litert_js', classesDetected);
    } catch (e: any) {
      setError(`Inference error: ${e.message}`);
    } finally {
      setPredicting(false);
    }
  }, [model, useFallback]);

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
    if (!model) return;
    setWebcamError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setWebcamError('Webcam not supported in this browser.');
      return;
    }

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
          if (!model || !videoRef.current || videoRef.current.readyState < 2) return;
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
            await reportLatency(totalMs, model.device, useFallback ? 'ort_web' : 'litert_js', classesDetected);
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
  }, [model, useFallback]);

  // Release camera + interval on unmount (e.g. navigating to #/dashboard)
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
        <WebGPUStatus device={device} loading={loading} />
        {useFallback && <div className="badge badge-fallback">ONNX fallback</div>}
      </div>

      {loading ? (
        <div className="drop-zone drop-zone-loading">
          <div className="loading-placeholder">
            <div className="spinner" aria-hidden="true" />
            <p>{error ? 'Retrying with ONNX fallback…' : 'Loading YOLO26m-seg model…'}</p>
            <span className="hint">First visit downloads ~90MB from CDN (cached on subsequent loads)</span>
          </div>
        </div>
      ) : (
        <div
          className="drop-zone"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => !imageUrl && !webcamActive && fileInputRef.current?.click()}
          style={webcamActive ? { cursor: 'default', flexDirection: 'column' } : undefined}
        >
          {webcamActive ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="result-canvas"
                style={{ position: 'absolute', inset: 0, zIndex: 1 }}
              />
              <canvas
                ref={canvasRef}
                className="result-canvas"
                style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
              />
            </>
          ) : imageUrl ? (
            <canvas ref={canvasRef} className="result-canvas" />
          ) : (
            <div className="drop-placeholder">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p>Drag & drop a leaf image or click to upload</p>
              <span className="hint">JPEG, PNG, or WebP — max 10MB</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {(!loading && (webcamActive || (imageUrl && !predicting))) && (
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
                className={`btn-secondary${webcamActive ? ' active' : ''}`}
                onClick={startWebcam}
              >
                Webcam mode
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={resetToUpload}
              >
                Try another image
              </button>
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
               loading ? 'Waiting for model to finish loading…' :
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
