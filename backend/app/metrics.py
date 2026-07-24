import time
from collections import deque
from dataclasses import dataclass, field
from threading import Lock
from typing import Optional

from prometheus_client import Counter, Gauge, Histogram


REQUESTS_TOTAL = Counter(
    "sugarcane_requests_total",
    "Total inference requests",
    ["endpoint"],
)

REQUESTS_ERRORS = Counter(
    "sugarcane_requests_errors_total",
    "Total inference errors",
    ["endpoint", "error_type"],
)

INFERENCE_LATENCY = Histogram(
    "sugarcane_inference_latency_seconds",
    "Time spent running YOLO inference",
    buckets=(0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1.0, 2.0, 5.0),
)

CLASSES_DETECTED = Counter(
    "sugarcane_classes_detected_total",
    "Detections per class",
    ["class_name"],
)

ACTIVE_CONNECTIONS = Gauge(
    "sugarcane_active_connections",
    "Currently processing requests",
)


@dataclass
class LatencyRecord:
    timestamp: float
    latency_ms: float
    device: str
    backend: str
    classes_detected: list[str] = field(default_factory=list)


class MetricsStore:
    """Ring buffer of latency records for the dashboard endpoint.

    Tracks absolute counters (requests_total / errors_total) alongside the
    bounded ring buffer so the dashboard can render error rate and throughput
    even when the ring buffer has rolled over.
    """

    def __init__(self, max_size: int = 1000):
        self._records: deque[LatencyRecord] = deque(maxlen=max_size)
        self._lock = Lock()
        self._requests_total = 0
        self._errors_total = 0

    def add(self, latency_ms: float, device: str, backend: str, classes: list[str]):
        record = LatencyRecord(
            timestamp=time.time(),
            latency_ms=latency_ms,
            device=device,
            backend=backend,
            classes_detected=classes,
        )
        with self._lock:
            self._records.append(record)
            self._requests_total += 1

    def record_error(self):
        """Increment the absolute error counter (e.g. timed-out /report calls)."""
        with self._lock:
            self._errors_total += 1

    def summary(self) -> dict:
        with self._lock:
            records = list(self._records)
            requests_total = self._requests_total
            errors_total = self._errors_total

        if not records:
            return {
                "count": 0,
                "p50_ms": None,
                "p99_ms": None,
                "mean_ms": None,
                "min_ms": None,
                "max_ms": None,
                "by_backend": {},
                "by_device": {},
                "classes_distribution": {},
                "throughput_per_min": 0.0,
                "error_rate": 0.0,
                "window_seconds": 0,
                "requests_total": requests_total,
                "errors_total": errors_total,
            }

        latencies = sorted(r.latency_ms for r in records)

        def percentile(sorted_list: list[float], p: float) -> float:
            idx = max(0, min(len(sorted_list) - 1, int(len(sorted_list) * p) - 1))
            return sorted_list[idx]

        by_backend: dict[str, int] = {}
        by_device: dict[str, int] = {}
        classes_dist: dict[str, int] = {}

        for r in records:
            by_backend[r.backend] = by_backend.get(r.backend, 0) + 1
            by_device[r.device] = by_device.get(r.device, 0) + 1
            for c in r.classes_detected:
                classes_dist[c] = classes_dist.get(c, 0) + 1

        window_seconds = max(1.0, records[-1].timestamp - records[0].timestamp)
        throughput_per_min = round(len(records) / (window_seconds / 60.0), 2)
        error_rate = round(errors_total / requests_total, 4) if requests_total else 0.0

        return {
            "count": len(records),
            "p50_ms": round(percentile(latencies, 0.50), 1),
            "p99_ms": round(percentile(latencies, 0.99), 1),
            "mean_ms": round(sum(latencies) / len(latencies), 1),
            "min_ms": round(latencies[0], 1),
            "max_ms": round(latencies[-1], 1),
            "by_backend": by_backend,
            "by_device": by_device,
            "classes_distribution": classes_dist,
            "throughput_per_min": throughput_per_min,
            "error_rate": error_rate,
            "window_seconds": round(window_seconds, 1),
            "requests_total": requests_total,
            "errors_total": errors_total,
        }


store = MetricsStore()
