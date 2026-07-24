import logging
import time
from pathlib import Path

import numpy as np
from PIL import Image
import io

from ultralytics import YOLO

logger = logging.getLogger("sugarcane.inference")

_MODEL_CACHE: dict[str, YOLO] = {}


def get_model(model_path: str | None = None) -> YOLO:
    """Lazy-load the YOLO model singleton.

    By default tries the .pt (server-side inference). Caches by path.
    """
    if model_path is None:
        model_path = str(Path(__file__).resolve().parents[2] / "models" / "Yolo26m-seg.pt")

    if model_path not in _MODEL_CACHE:
        logger.info("Loading YOLO model from %s", model_path)
        _MODEL_CACHE[model_path] = YOLO(model_path, task="segment")

    return _MODEL_CACHE[model_path]


def run_inference(image_bytes: bytes, model_path: str | None = None, conf: float = 0.5) -> dict:
    """Run YOLO segmentation on raw image bytes and return structured results.

    Returns dict with:
        - detections: list of {class_name, confidence, bbox, mask_summary}
        - latency_ms: float
        - image_shape: (width, height)
    """
    model = get_model(model_path)

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_array = np.array(img)

    t0 = time.perf_counter()
    results = model.predict(source=img_array, conf=conf, verbose=False)
    latency_ms = (time.perf_counter() - t0) * 1000

    r = results[0]
    detections = []

    if r.boxes is not None and len(r.boxes) > 0:
        names = model.names
        for i in range(len(r.boxes)):
            cls_id = int(r.boxes.cls[i])
            det = {
                "class_id": cls_id,
                "class_name": names[cls_id],
                "confidence": round(float(r.boxes.conf[i]), 4),
                "bbox": [round(x, 1) for x in r.boxes.xyxy[i].tolist()],
            }

            if r.masks is not None and len(r.masks) > i:
                mask = r.masks[i]
                mask_area = int(mask.data.sum().item())
                det["mask_area_pixels"] = mask_area
                det["mask_shape"] = list(mask.data.shape[-2:])

            detections.append(det)

    return {
        "detections": detections,
        "n_detections": len(detections),
        "latency_ms": round(latency_ms, 1),
        "image_shape": [img.width, img.height],
        "model": "Yolo26m-seg",
        "device": "server-cpu",
    }
