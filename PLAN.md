# Sugarcane Leaf Disease Detection — Plan de Deployment MLOps

## Contexto

Portfolio project para cerrar dos huecos críticos en el portfolio de Lucas Romero (AI/ML Engineer + Fullstack Developer):

1. **Deep Learning entrenado por vos** — PyTorch/CV que se declara en Skills pero no se demuestra.
2. **MLOps deployment** — La promesa del About ("deploying ML models to production — inference pipelines, latency optimization") hoy_no se respalda con ningún proyecto.

El modelo `Yolo26m-seg.pt` ya está fine-tuneado por Lucas sobre un dataset de 6004 imágenes de Roboflow (5 clases: healthy, mosaic, red_rot, rust, yellow). No se reentrenará — solo se exporta, se sirve, se mide y se muestra en producción.

---

## Decisiones técnicas

| Decisión | Valor | Razón |
|---|---|---|
| Runtime de inferencia web | **LiteRT.js** vía `@ultralytics/yolo` | WebGPU ~2× vs ONNX Runtime Web; diferenciador de portfolio; soporte oficial Ultralytics desde v2.1.0 (Dic 2025). |
| Export crítico | `.tflite` con **`end2end=False`** forzado | YOLO26m-seg trae head NMS-free por defecto. Ops `int64/gather_nd` no soportadas en WebGPU → caen silenciosamente a WASM. Sin este flag el plan colapsa. |
| Fallback | `.onnx` (`opset=12`) + `ort-web` | Si LiteRT.js falla en producción, este path está 100% probado. Se pivotea en horas. |
| Conversión directa `litert-torch` | **NO usar** | Bug abierto #506 corrompe `.tflite` en bloques C3K2 de YOLO11/26. La integración Ultralytics (`model.export(format="litert")`) lo evita internamente. |
| Reentrenamiento | No | Modelo ya fine-tuneado y validado por Lucas en Kaggle. Solo se re-valida post-export. |
| Scope | Completo (2 semanas, ~80h) | Dashboard de métricas + demo visual. Cierra ambos huecos del portfolio. |

### Riesgo principal de porting

El modelo fuente es **YOLO26**, no YOLO11. Existe riesgo no nulo de que el exportador de Ultralytics para formato `litert` produzca un `.tflite` no compatible con el head de YOLO26m-seg. Por eso la Fase 1 es **make-or-break**: si LiteRT.js no delega la mayoría de ops a WebGPU, se pivotea a ONNX `opset=12` + `ort-web` antes de invertir en el frontend.

---

## Mapeo objetivo → portfolio

| Hueco cubierto | Cómo | Dónde se muestra |
|---|---|---|
| "Deploying ML models to production — inference pipelines, latency optimization" | LiteRT.js WebGPU + dashboard de latencia p50/p99 + throughput | README + Project card |
| PyTorch / ONNX (DL entrenado por vos) | Modelo YOLO26m-seg custom entrenado | Stack visual en card |
| Computer Vision real (no-LLM, no-series clásicas) | Segmentación de hojas + inferencia en imagen y video | Card description + demo live |

---

## Arquitectura objetivo

```
                     ┌────────────────────────────────────────────┐
                     │              Browser (cliente)              │
                     │                                            │
                     │  ┌─────────────────┐   ┌─────────────────┐ │
                     │  │ @ultralytics/   │   │  LatencyTicker  │ │
                     │  │ yolo + LiteRT   │   │  (p50/p99 live) │ │
                     │  │ .tflite WebGPU  │   │                 │ │
                     │  └─────────────────┘   └────────┬────────┘ │
                     │           │                     │          │
                     │           ▼                     ▼          │
                     │     Canvas overlay          POST /report   │
                     │   (boxes + masks)            (latency)     │
                     └────────────────────────────────────────────┘
                                     │
                                     ▼
                     ┌────────────────────────────────────────────┐
                     │           Backend (FastAPI)                │
                     │                                            │
                     │  POST /predict    GET /metrics-summary     │
                     │  GET  /health     [Prometheus client]      │
                     │  POST /report     (ring buffer 1000 reqs)  │
                     └────────────────────────────────────────────┘
                                     │
                                     ▼
                     ┌────────────────────────────────────────────┐
                     │      Deploy: Render free + UptimeRobot     │
                     │      Frontend: Vercel / Cloudflare Pages   │
                     │      Modelo: servido estático (.tflite)    │
                     └────────────────────────────────────────────┘
```

Headers de cross-origin isolation en el frontend (necesarios para SharedArrayBuffer de WASM threaded de LiteRT.js):
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

---

## Estructura del repo

```
sugarcane-leaf-disease/
├── models/                  # .pt original + .tflite exportado + .onnx fallback
│   ├── Yolo26m-seg.pt
│   ├── Yolo26m-seg.tflite
│   └── Yolo26m-seg.onnx
├── dataset/                 # original (NO commitear — .gitignore)
│   ├── data.yaml
│   ├── data.abs.yaml        # paths absolutos para validación local
│   ├── train/
│   ├── valid/
│   └── test/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI: POST /predict, GET /metrics-summary, /report, /health
│   │   ├── inference.py      # wrapper ultralytics (server-side inference fallback)
│   │   └── metrics.py        # prometheus_client + ring buffer de latencias
│   ├── tests/
│   │   ├── test_inference.py
│   │   └── test_api.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── lib/yolo.ts           # wrapper @ultralytics/yolo
│   │   ├── lib/webgpu-detect.ts  # detección de soporte + fallback ort-web
│   │   ├── components/DemoCanvas.tsx
│   │   ├── components/MetricsTicker.tsx
│   │   └── components/WebGPUStatus.tsx
│   ├── public/models/           # .tflite servido estático
│   ├── package.json
│   └── vite.config.ts
├── docs/
│   ├── architecture.md
│   ├── predictions/         # README screenshots
│   └── dashboard.png
├── reports/
│   ├── val_metrics.json
│   ├── export_validation.md
│   └── loadtest.md
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml
├── .gitignore
├── PLAN.md                  # este documento
└── README.md
```

---

## Fases del proyecto

### Fase 0 — Setup y reconstrucción de métricas (4–6h)

**Por qué necesaria:** el portfolio no puede citar "mAP 0.XX" sin métricas. Como se perdieron los checkpoints de comparación, al menos se re-valida el único modelo conservado contra el set de test. Mandatorio para el README y la card.

**Tareas:**
1. Crear venv Python + instalar `ultralytics>=8.4.83`, `torch`, `torchvision`, `litert`, `ai-edge-litert`, `fastapi`, `uvicorn`, `pydantic`, `python-multipart`, `pytest`, `httpx`.
2. Generar `dataset/data.abs.yaml` con paths absolutos (el actual usa rutas relativas a Roboflow).
3. Re-validar el modelo sobre el test set con `model.val(split='test', plots=True)`.
4. Guardar métricas (`mAP@0.5`, `mAP@0.5:0.95`, IoU per class, precision/recall per class) en `reports/val_metrics.json`.
5. Generar 5–6 predicciones visuales (4 aciertos + 1–2 falsos positivos para honestidad del README) en `reports/predictions/`.
6. `git init` del repo (aún sin publicar).

**Criterios de salida:**
- [ ] venv funcional con `ultralytics` importable.
- [ ] `reports/val_metrics.json` con mAP@0.5 y mAP@0.5:0.95.
- [ ] 5 predicciones visuales en `reports/predictions/`.
- [ ] Repo Git inicializado.

---

### Fase 1 — Exportación `.pt` → `.tflite` + validación numérica (6–8h) — **CRÍTICA**

**Por qué es crítica:** acá es donde muere el 50% de los proyectos similares. Bugs silentes en la conversión → el modelo "corre" pero da predicciones basura. Esta fase es make-or-break para todo el plan.

**Tareas:**
1. **Export primario (LiteRT):**
   ```python
   from ultralytics import YOLO
   model = YOLO('/home/sac/src/Sugarcane/models/Yolo26m-seg.pt')
   model.export(format='litert', end2end=False, imgsz=640)
   # Genera: models/Yolo26m-seg.tflite
   ```
   `end2end=False` fuerza la head estándar y que NMS corra en el runtime JS de Ultralytics. Sin esto el modelo "corre" pero cae silenciosamente a WASM.

2. **Export de fallback (ONNX, Plan B):**
   ```python
   model.export(format='onnx', opset=12, dynamic=True, imgsz=640)
   # Genera: models/Yolo26m-seg.onnx
   ```

3. **Validación numérica LOCAL (intra-Python, antes de tocar JS):**
   - Comparar PyTorch vs LiteRT vs ONNX sobre 50 imágenes del test set.
   - Métrica: max abs diff por output tensor, % de predicciones idénticas (mismas bboxes + mismo label).
   - Guardar en `reports/export_validation.md`.

4. **Test con LiteRT Model Tester (recomendado):**
   ```bash
   npm i @litertjs/model-tester
   npx model-tester   # abrir .tflite y revisar sección "delegated to GPU"
   ```
   Buscar que la mayoría de ops corran en WebGPU. Si 0% delegated → investigar `end2end=False` o inspeccionar el grafo con Netron.

**Criterios de salida:**
- [ ] `models/Yolo26m-seg.tflite` (≤30MB típico para m-seg).
- [ ] `models/Yolo26m-seg.onnx` (fallback).
- [ ] `reports/export_validation.md` con delta numérico PyTorch vs LiteRT.
- [ ] **GATE:** si delta <2% numérico y >99% detecciones idénticas → continuar. Si no, NO pasar a Fase 2.

**Riesgo a vigilar:** si LiteRT Model Tester reporta 0% WebGPU delegated, debuguear:
- ¿Olvidaste `end2end=False`?
- ¿Hay ops `int64/topk/gather_nd` en el grafo? (Inspeccionar con Netron `netron.app`.)
- Si no se resuelve, pivotea a ONNX `opset=12` + `ort-web` (fallback preparado).

---

### Fase 2 — Monorepo + Backend Inference API (8–10h)

**Por qué backend si LiteRT.js corre en browser:** el dashboard de métricas necesita lado servidor para coleccionar latencia p50/p99 de usuarios reales que visiten la demo. Sin esto hay deployment pero no MLOps observable.

**Tareas:**
1. Crear estructura del repo según el árbol de arriba.
2. Backend FastAPI:
   - `POST /predict` — recibe imagen, corre YOLO en CPU con Ultralytics (server-side), devuelve JSON con boxes, masks, latencia.
   - `GET /metrics-summary` — JSON pre-agregado con array de latencias últimas 1000 requests (ring buffer en memoria, no persistir).
   - `POST /report` — endpoint que el frontend usa para reportar la latencia medida cliente-side.
   - `GET /metrics` — endpoint Prometheus scrape.
   - `GET /health` — para UptimeRobot/Render keep-alive (mismo patrón que Granger).
   - Logging con `structlog` (más pro que stdlib).
3. Tests básicos:
   - `test_inference.py` — imagen vacía → 400, imagen válida → 200 con keys esperadas.
   - `test_api.py` — smoke test de `/health`, `/predict`, `/metrics-summary`.
4. Dockerizar el backend (patrón de Granger).

**Criterios de salida:**
- [ ] `curl localhost:8000/health` → 200.
- [ ] `curl -F image=@leaf.jpg localhost:8000/predict` → JSON con detecciones.
- [ ] `pytest backend/tests` → verde.
- [ ] `docker compose up backend` → levanta en :8000.

---

### Fase 3 — Frontend web demo con LiteRT.js / WebGPU (12–14h)

**Acá es donde se gana el portfolio.** La demo tiene que ser visual y rápida — un reviewer la abre, hace drag & drop de una hoja, y ve las detecciones en <300ms sin salir del browser.

**Stack frontend:**
- `vite + react + typescript` (alineado con Granger/Killa).
- `@ultralytics/yolo` — wrapper oficial que abstrae LiteRT.js/ort-web.
- `@litertjs/core` — runtime WebGPU.
- `onnxruntime-web` — instalado pero solo se carga si LiteRT.js falla en runtime detect.

**Tareas:**
1. Copiar `models/Yolo26m-seg.tflite` a `frontend/public/models/`.
2. Configurar headers COOP/COEP en `vite.config.ts` (o `vercel.json` / Cloudflare Pages config).
3. Componentes clave:
   - `<DemoCanvas>` — drag & drop / file picker + canvas con boxes + máscaras pintadas.
   - `<WebGPUStatus>` — indicador visible: "Running on WebGPU" / "Fallback to WASM".
   - `<LatencyTicker>` — muestra `lastInferenceMs` en vivo y POSTea a `/report`.
4. Detección de soporte WebGPU con fallback automático a `ort-web` + `.onnx`:
   ```ts
   const adapter = await navigator.gpu?.requestAdapter?.();
   // si no hay → cargar .onnx + ort-web
   ```
5. Modo imagen + modo video (webcam a 5fps o subida de MP4 a 1fps).

**Criterios de salida:**
- [ ] Drag & drop de una hoja de test → detecciones en <500ms en Chrome desktop.
- [ ] En Firefox → cae a WASM automáticamente y muestra badge "Fallback".
- [ ] Botón webcam → segmentación live (5fps mínimo sostenido 30s).
- [ ] Latencia visible en UI (no solo en logs).

---

### Fase 4 — Dashboard de métricas (8–10h)

**Cierra el gap "MLOps / latency optimization" del About.** Sin esto, LiteRT.js solo es un deployment. Con esto, es MLOps real.

**Qué muestra el dashboard:**
- p50, p99 latency (cliente y servidor, separados).
- Throughput — inferencias / minuto últimas 24h.
- Heatmap backend — % usuarios en WebGPU vs WASM vs ort-web fallback.
- Distribución de clases detectadas — cuántas veces el modelo predijo cada enfermedad.
- Tasa de fallos — % requests con timeout >5s o error.

**Stack:** Single page React + ChartJS (~200 líneas). Stats viven en ring buffer del backend + `localStorage` del visitante. Sin Grafana (es 4h, no 2 días — el README con screenshots del dashboard pesa más para portfolio que un Grafana complejo).

**Tareas:**
- Endpoint `GET /metrics-summary` en backend (JSON pre-agregado).
- Frontend lo consulta cada 30s y actualiza gráficos.
- Exportar screenshot a `docs/dashboard.png` para el README.

**Criterios de salida:**
- [ ] `/metrics-summary` con JSON válido.
- [ ] Dashboard visible en `/dashboard`.
- [ ] Latencia p50/p99 visibles y actualizadas en vivo.
- [ ] Conteo de backends usados (WebGPU vs WASM).
- [ ] Screenshot commiteado a `docs/dashboard.png`.

---

### Fase 5 — Inferencia en video + test de carga (6–8h) — **OPCIONAL**

Si no hay tiempo en las 2 semanas, saltear esta fase. Dejar como incomplete explícita en el README (honestidad > pretender completo). Si se llega, inferencia en tiempo real es el diferenciador "wow".

**Tareas:**
1. Webcam mode a 5fps mínimo sostenido.
2. Load test con `k6`:
   ```bash
   k6 run --vus 5 --duration 1m loadtest.js
   ```
   Simular 5 usuarios concurrentes → colectar p99, error rate, throughput. Anotar en `reports/loadtest.md`.
3. Dashboard actualiza con datos del load test.

**Criterios de salida:**
- [ ] Webcam mode: 5fps mínimos sostenidos 30s sin crashear.
- [ ] `reports/loadtest.md` con p99 < 2s bajo 5 usuarios concurrentes.
- [ ] Dashboard refleja el load test.

---

### Fase 6 — Deploy + CI/CD + README + integración al portfolio (8–10h)

**Tareas:**

1. **Deploy:**
   - Frontend → Vercel (o Cloudflare Pages si Vercel no permite COOP/COEP custom).
   - Backend → Render free (con UptimeRobot keep-alive, mismo truco que Granger).
   - Modelo `.tflite` → servido estático desde Vercel/Cloudflare, CDN cacheado.

2. **CI/CD con GitHub Actions:**
   - `ci.yml` — typecheck frontend + pytest backend + smoke test del `.tflite` no corrupto.
   - `deploy.yml` — deploy hooks a Vercel/Render en push a main.

3. **README senior-grade** (molde de Granger):
   - Front-matter con badges (Latencia p99, mAP@0.5, WebGPU support).
   - Live demo link arriba.
   - Modelo y métricas — tabla con 5 clases (mAP@0.5 = 0.X, etc).
   - Diagrama de arquitectura (copiar patrón de EpiGuard).
   - **Tradeoff técnico destacado:** "Por qué LiteRT.js + WebGPU en lugar de un endpoint PyTorch" (latencia edge, privacidad server-side 0, cost 0).
   - Limitaciones honestas: Firefox sin WebGPU, cold start del backend, momento fallback.
   - Sección "Metrics Dashboard" con screenshot.
   - Load test results: "50 req/s → p99 = Xms".
   - Reproducibilidad: cómo re-entrenar, cómo re-exportar.

4. **Integración al portfolio** — agregar 5ª card a `PersonalPortfolio/lucas-romero-portfolio/index.html`:
   > **SugarcaneLeaf** — Foliar disease segmentation for sugarcane. YOLO26m-seg trained on 6k field images (5 classes) achieving mAP@0.5 of 0.X, exported to LiteRT and served in the browser via WebGPU — **p99 inference latency 47ms client-side, no server roundtrip**. Includes live latency dashboard and webcam demo. [Live demo] · [Code]

**Criterios de salida:**
- [ ] Demo Vercel live y funcional.
- [ ] Backend Render live, health check OK.
- [ ] CI verde en push a main.
- [ ] README 200–300 palabras por sección.
- [ ] Card agregada al `index.html` del portfolio.

---

## Distribución temporal estimada (2 semanas, ~80h)

| Fase | Horas | Acumulado | Crítica |
|---|---|---|---|
| 0. Setup + métricas | 5h | 5h | Sí |
| 1. Export + validación numérica | 7h | 12h | **Sí — make-or-break** |
| 2. Backend FastAPI | 9h | 21h | Sí |
| 3. Frontend LiteRT.js | 13h | 34h | Sí |
| 4. Dashboard | 9h | 43h | Sí |
| 5. Video + load test | 7h | 50h | Opcional |
| 6. Deploy + README + portfolio | 9h | 59h | Sí |
| Buffer / debug | 21h | 80h | — |

**Distribución realista (~5–6h/día efectivas):**
- Semana 1: Fases 0, 1, 2, 3 (parcial).
- Semana 2: Fase 3 (fin), 4, 5 (si alcanza), 6.

---

## Riesgos principales

| Riesgo | Prob | Impacto | Mitigación |
|---|---|---|---|
| `.tflite` export crashea en head de YOLO26m-seg | Media | Crítico | Validar en Fase 1 con Model Tester antes de Fase 3. Fallback ONNX `opset=12` + `ort-web` está preparado. |
| LiteRT.js no soporta custom head de YOLO26m | Baja-media | Alto | Test en Fase 1. Si falla → pivoteo a ort-web en horas. |
| Vercel no permite COOP/COEP headers custom | Baja | Medio | Cloudflare Pages fallback (migración ~30min). |
| Backend cold start en free tier mata UX demo | Media | Medio | UptimeRobot keep-alive (patrón Granger). |
| El modelo en WebGPU da resultados distintos a PyTorch | Baja | Alto | Validación numérica Fase 1. Si float diff >3%, usar ort-web fallback. |
| Milestone "todo" se labura de más y no se llega a Fase 6 | Alta | Crítico | Recortar Fase 5 primero. Prioridad: Card en portfolio > Dashboard > Load test > Webcam. |

---

## Orden de recorte (si falta tiempo)

1. **No recortar:** Fases 0, 1, 2, 6 (sin estas el portfolio no gana nada).
2. **Recortar primero:** Fase 5 (video + load test) — explícitamente marcada como opcional.
3. **Recortar segundo:** Sección webcam de la Fase 3 (dejar solo drag & drop de imágenes).
4. **Nunca recortar:** Fase 6 integración al portfolio — sin la card, el proyecto no tiene valor para Lucas.

---

## Definición de "Done" del proyecto

- [ ] `.tflite` exportado y validado numéricamente vs PyTorch (delta <2%).
- [ ] Backend FastAPI deployado en Render con `/health` alive.
- [ ] Frontend en Vercel/Cloudflare con demo funcional (drag & drop → boxes + masks).
- [ ] Dashboard de latencia p50/p99 visible y actualizado.
- [ ] README con métricas, tradeoff, limitaciones, screenshots.
- [ ] Card en `PersonalPortfolio/.../index.html` con live demo link y métricas citadas.
- [ ] 5ª project card visible en el portfolio deployado.
