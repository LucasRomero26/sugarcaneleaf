import logging
from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from .inference import run_inference
from .metrics import (
    REQUESTS_TOTAL,
    REQUESTS_ERRORS,
    INFERENCE_LATENCY,
    CLASSES_DETECTED,
    ACTIVE_CONNECTIONS,
    store,
)

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
)
logger = structlog.get_logger()

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/jpg"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup", service="sugarcane-backend")
    yield
    logger.info("shutdown", service="sugarcane-backend")


app = FastAPI(
    title="Sugarcane Leaf Disease Detection API",
    description="Inference API for YOLO26m-seg foliar disease segmentation model. "
                "Serves server-side inference and collects latency metrics from the browser demo.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "sugarcane-backend", "version": "0.1.0"}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    REQUESTS_TOTAL.labels(endpoint="predict").inc()

    if file.content_type not in ALLOWED_TYPES:
        REQUESTS_ERRORS.labels(endpoint="predict", error_type="bad_content_type").inc()
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}. Use JPEG, PNG, or WebP.")

    image_bytes = await file.read()
    if len(image_bytes) > MAX_FILE_SIZE:
        REQUESTS_ERRORS.labels(endpoint="predict", error_type="file_too_large").inc()
        raise HTTPException(status_code=413, detail="File too large. Max 10MB.")
    if len(image_bytes) == 0:
        REQUESTS_ERRORS.labels(endpoint="predict", error_type="empty_file").inc()
        raise HTTPException(status_code=400, detail="Empty file.")

    ACTIVE_CONNECTIONS.inc()
    try:
        with INFERENCE_LATENCY.time():
            result = run_inference(image_bytes)

        classes_detected = [d["class_name"] for d in result["detections"]]
        for cls in classes_detected:
            CLASSES_DETECTED.labels(class_name=cls).inc()

        logger.info(
            "predict_ok",
            n_detections=result["n_detections"],
            latency_ms=result["latency_ms"],
            classes=classes_detected,
        )
        return result

    except Exception as e:
        REQUESTS_ERRORS.labels(endpoint="predict", error_type="inference_error").inc()
        logger.error("predict_error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")
    finally:
        ACTIVE_CONNECTIONS.dec()


@app.post("/report")
async def report(request: Request):
    """Receive latency report from the browser demo (client-side LiteRT.js inference)."""
    REQUESTS_TOTAL.labels(endpoint="report").inc()
    try:
        body = await request.json()
    except Exception:
        REQUESTS_ERRORS.labels(endpoint="report", error_type="bad_json").inc()
        store.record_error()
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    latency_ms = body.get("latency_ms")
    device = body.get("device", "unknown")
    backend = body.get("backend", "unknown")
    classes = body.get("classes_detected", [])

    if latency_ms is None or not isinstance(latency_ms, (int, float)):
        REQUESTS_ERRORS.labels(endpoint="report", error_type="bad_latency").inc()
        store.record_error()
        raise HTTPException(status_code=400, detail="latency_ms must be a number.")

    store.add(
        latency_ms=float(latency_ms),
        device=str(device),
        backend=str(backend),
        classes=[str(c) for c in classes],
    )

    logger.info(
        "report_ok",
        latency_ms=latency_ms,
        device=device,
        backend=backend,
        n_classes=len(classes),
    )
    return {"status": "ok"}


@app.get("/metrics-summary")
async def metrics_summary():
    """Pre-aggregated metrics for the dashboard."""
    REQUESTS_TOTAL.labels(endpoint="metrics-summary").inc()
    return store.summary()


@app.get("/metrics")
async def prometheus_metrics():
    """Prometheus scrape endpoint."""
    return JSONResponse(
        content=generate_latest().decode("utf-8"),
        media_type=CONTENT_TYPE_LATEST,
    )


@app.get("/")
async def root():
    return {
        "service": "Sugarcane Leaf Disease Detection API",
        "version": "0.1.0",
        "endpoints": {
            "POST /predict": "Upload an image, get detections + latency (server-side inference)",
            "POST /report": "Report client-side latency from the browser demo",
            "GET /metrics-summary": "Pre-aggregated metrics for the dashboard",
            "GET /metrics": "Prometheus scrape endpoint",
            "GET /health": "Health check",
        },
    }
