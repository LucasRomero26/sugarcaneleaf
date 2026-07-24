import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "service" in data
    assert "version" in data


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "service" in data
    assert "endpoints" in data


def test_predict_empty_file():
    response = client.post(
        "/predict",
        files={"file": ("empty.jpg", b"", "image/jpeg")},
    )
    assert response.status_code == 400


def test_predict_bad_content_type():
    response = client.post(
        "/predict",
        files={"file": ("test.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 400


def test_predict_valid_image():
    """Smoke test with a real test image — uses server-side YOLO inference."""
    test_img = Path(__file__).resolve().parents[2] / "dataset" / "test" / "images"
    images = sorted(test_img.glob("*.jpg"))
    if not images:
        pytest.skip("No test images available")

    image_bytes = images[0].read_bytes()
    response = client.post(
        "/predict",
        files={"file": (images[0].name, image_bytes, "image/jpeg")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "detections" in data
    assert "latency_ms" in data
    assert "image_shape" in data
    assert "model" in data
    assert data["model"] == "Yolo26m-seg"
    assert isinstance(data["detections"], list)
    assert isinstance(data["latency_ms"], (int, float))
    assert isinstance(data["n_detections"], int)


def test_report_valid():
    response = client.post(
        "/report",
        json={
            "latency_ms": 47.3,
            "device": "webgpu",
            "backend": "litert_js",
            "classes_detected": ["healthy", "rust"],
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_report_bad_json():
    response = client.post("/report", json={"missing_latency": True})
    assert response.status_code == 400


def test_metrics_summary():
    # First push a report so the store is not empty
    client.post(
        "/report",
        json={
            "latency_ms": 50.0,
            "device": "webgpu",
            "backend": "litert_js",
            "classes_detected": ["rust"],
        },
    )
    client.post(
        "/report",
        json={
            "latency_ms": 100.0,
            "device": "wasm",
            "backend": "ort_web",
            "classes_detected": ["mosaic"],
        },
    )

    response = client.get("/metrics-summary")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] >= 2
    assert data["p50_ms"] is not None
    assert data["p99_ms"] is not None
    assert "by_backend" in data
    assert "by_device" in data
    assert "classes_distribution" in data
    assert "throughput_per_min" in data
    assert isinstance(data["throughput_per_min"], (int, float))
    assert data["throughput_per_min"] > 0
    assert "error_rate" in data
    assert isinstance(data["error_rate"], (int, float))
    assert 0.0 <= data["error_rate"] <= 1.0
    assert "requests_total" in data
    assert isinstance(data["requests_total"], int)
    assert data["requests_total"] >= 2
    assert "errors_total" in data
    assert "window_seconds" in data
    assert data["window_seconds"] >= 0


def test_metrics_summary_error_rate():
    # Push a bad report to bump the error counter
    client.post("/report", json={"not_latency": True})
    # Push a good one
    client.post(
        "/report",
        json={"latency_ms": 30.0, "device": "wasm", "backend": "ort_web"},
    )
    response = client.get("/metrics-summary")
    assert response.status_code == 200
    data = response.json()
    assert data["errors_total"] >= 1
    assert data["error_rate"] > 0.0


def test_metrics_summary_empty():
    # Fresh store returns the full empty schema
    from app.metrics import MetricsStore

    summary = MetricsStore().summary()
    for key in (
        "count", "p50_ms", "p99_ms", "mean_ms", "min_ms", "max_ms",
        "by_backend", "by_device", "classes_distribution",
        "throughput_per_min", "error_rate", "window_seconds",
        "requests_total", "errors_total",
    ):
        assert key in summary
    assert summary["count"] == 0
    assert summary["throughput_per_min"] == 0.0
    assert summary["error_rate"] == 0.0


def test_prometheus_metrics():
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "sugarcane_" in response.text
