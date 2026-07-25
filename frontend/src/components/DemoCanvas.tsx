import { useEffect, useRef, useState, useCallback } from 'react';
import type { YOLO, Results } from '@ultralytics/yolo';
import { loadModel, runInference, freeModel } from '../lib/yolo';
import { reportLatency } from '../lib/metrics';
import { WebGPUStatus } from './WebGPUStatus';
import { classColors, yoloClasses, prettyClass, MODEL_PATH, FALLBACK_MODEL_PATH } from '../lib/config';

const CONF_THRESHOLD = 0.5;

export function DemoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [model, setModel] = useState<YOLO | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);

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
    if (file) handleFile(file);
  };

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

      <div
        className="drop-zone"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
      >
        {imageUrl ? (
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

      <div className="demo-footer">
        <div className="detections-panel">
          <h3>Detections {latency && <span className="latency">{latency.toFixed(0)}ms</span>}</h3>
          {detectionList.length > 0 ? (
            <div className="detection-list">{detectionList}</div>
          ) : (
            <p className="no-detections">
              {predicting ? 'Running inference...' : 'No detections yet. Upload an image.'}
            </p>
          )}
          {error && <div className="error">{error}</div>}
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
