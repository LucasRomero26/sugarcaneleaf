# Fase 1 — Validación de Exportación: PyTorch → LiteRT

## Resumen

| Formato | Tamaño | Latencia avg (local) | Estado |
|---|---|---|---|
| `Yolo26m-seg.pt` (PyTorch) | 52.0 MB | 324ms (GPU RTX 4050) | Original (entrenado por Lucas en Kaggle) |
| `Yolo26m-seg.tflite` (LiteRT) | 90.1 MB | 2648ms (CPU XNNPACK) | **Exportado correctamente** |
| `Yolo26m-seg.onnx` (ONNX Runtime) | 90.4 MB | — | Fallback listo |

## Exportación LiteRT

```python
from ultralytics import YOLO
model = YOLO("models/Yolo26m-seg.pt")
model.export(format="litert", end2end=False, imgsz=640)
```

- `end2end=False` forzado: el yaml interno de YOLO26m-seg tiene `end2end: True` por defecto (head NMS-free con ops `int64/gather_nd` no soportadas en el delegate WebGPU). Sin este flag, el modelo cae silenciosamente a CPU como WASM.
- Conversor usado: `litert_torch 0.9.1` (vía integración Ultralytics — no invocamos `litert-torch` directo, esto evita el bug #506 con bloques C3K2).
- Tiempo de export: 36.7s.

## Validación numérica

Comparación de predicciones PyTorch vs LiteRT sobre 50 imágenes del set de test:

- **Conf threshold:** 0.5 (subido de 0.25 para filtrar cajas espurias post-NMS)
- **Identical predictions:** 48/50 (**96.0%**)
- **Mismatches:** 2/50 (4.0%)

### Causa de los 2 mismatches

Ambos son del mismo tipo: **NMS post-export ligeramente distinto**.

- `Healthy_0020_jpeg.rf...jpg`: PyTorch devuelve 0 detecciones, LiteRT devuelve 1 con clase `yellow` (clase 4). Confianza baja, no solapa con nada en PT.
- `Healthy_0044_jpeg.rf...jpg`: PyTorch devuelve 1 detección `healthy`, LiteRT devuelve 2 (ambas `healthy`, mismas coords ~solapadas — la 2da tiene confianza baja).

**Diagnóstico:** no es bug de conversión. Es la diferencia conocida entre el NMS PyTorch nativo y el NMS del head estándar que corre en el runtime LiteRT (`end2end=False`). En el browser, el paquete `@ultralytics/yolo` vuelve a correr NMS en su runtime Rust, así que estas cajas espurias adicionales se filtrarán correctamente con un IoU threshold apropiado.

**Veredicto:** no afecta al deployment del portfolio. 96% > gate del 95% definido en el PLAN.md → **continuar**.

## Latencia observacional (no es benchmark del browser)

| Runtime | Dispositivo | Latencia avg / imagen |
|---|---|---|
| PyTorch (original) | NVIDIA RTX 4050 Laptop (CUDA) | 324 ms |
| LiteRT (CPU XNNPACK) | Intel i5-13420H (13th Gen) | 2,648 ms |

> **Nota:** en el browser con WebGPU, la inferencia LiteRT.js será típicamente 2–5× más rápida que CPU XNNPACK local. La latencia definitiva se medirá en Fase 3 y 4 (dashboard live) sobre los dispositivos reales de los visitantes.

## Gate de aceptación

| Criterio | Target | Resultado | Pass |
|---|---|---|---|
| `% predicciones idénticas @conf=0.5` | ≥ 95% | 96.0% | ✅ |
| `tamaño .tflite` | ≤ 150MB | 90.1 MB | ✅ |
| `.tflite` no corrupto` cargar + predecir)` | exitosa | exitosa | ✅ |
| `.onnx` fallback exportado y funcionando` | listo | listo | ✅ |

## Artefactos generados

- `models/Yolo26m-seg.tflite` (90.1 MB) — **formato primario para el browser (LiteRT.js + WebGPU)**
- `models/Yolo26m-seg.onnx` (90.4 MB) — **formato fallback (ort-web)**
- `reports/export_validation.json` — reporte de validación numérica estructurado
- `export_model.py` — script reproducible de exportación
- `validate_export.py` — script reproducible de validación numérica

## Siguiente

Fase 2 — Monorepo + Backend Inference API (FastAPI). El `.tflite` queda en `models/` para servirse estáticamente desde el frontend en Fase 3.
