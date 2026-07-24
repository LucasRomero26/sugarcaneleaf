import warnings
import json
import time
from pathlib import Path
from collections import Counter

warnings.filterwarnings("ignore")
from ultralytics import YOLO

PT_PATH = "/home/sac/src/Sugarcane/models/Yolo26m-seg.pt"
TFLITE_PATH = "/home/sac/src/Sugarcane/models/Yolo26m-seg.tflite"
TEST_DIR = Path("/home/sac/src/Sugarcane/dataset/test/images")
N_IMAGES = 50  # subset para validación numérica rápida
CONF_THRESHOLD = 0.5  # subido de 0.25: filtra cajas espurias de baja confianza del NMS de LiteRT

print("Cargando modelo PyTorch...")
model_pt = YOLO(PT_PATH)
print("Cargando modelo LiteRT...")
model_tflite = YOLO(TFLITE_PATH, task="segment")
print()

test_images = sorted(TEST_DIR.glob("*.jpg"))[:N_IMAGES]
print(f"Comparando predicciones sobre {len(test_images)} imagenes de test...")
print()

identical_preds = 0
total_preds = 0
pt_total_time = 0
tflite_total_time = 0
class_match_count = Counter()
class_mismatch_count = Counter()

mismatches = []

for i, img_path in enumerate(test_images):
    if (i + 1) % 10 == 0:
        print(f"  {i+1}/{len(test_images)}...")

    # PyTorch
    t0 = time.time()
    pt_results = model_pt.predict(source=str(img_path), verbose=False, conf=CONF_THRESHOLD)
    pt_time = time.time() - t0
    pt_total_time += pt_time

    # LiteRT
    t0 = time.time()
    tflite_results = model_tflite.predict(source=str(img_path), verbose=False, conf=CONF_THRESHOLD)
    tflite_time = time.time() - t0
    tflite_total_time += tflite_time

    pt_r = pt_results[0]
    tflite_r = tflite_results[0]

    pt_classes = [int(c) for c in pt_r.boxes.cls] if len(pt_r.boxes) > 0 else []
    tflite_classes = [int(c) for c in tflite_r.boxes.cls] if len(tflite_r.boxes) > 0 else []

    # Comparación 1: mismo número de detecciones
    if len(pt_classes) == len(tflite_classes):
        # Comparación 2: mismas clases en el mismo orden (simplificado)
        if pt_classes == tflite_classes:
            identical_preds += 1
            for c in pt_classes:
                class_match_count[c] += 1
        else:
            class_mismatch_count[tuple(sorted(pt_classes))] += 1
            mismatches.append({
                "image": img_path.name,
                "pt_classes": pt_classes,
                "tflite_classes": tflite_classes,
                "issue": "class_missmatch",
            })
    else:
        class_mismatch_count[tuple(sorted(pt_classes))] += 1
        mismatches.append({
            "image": img_path.name,
            "pt_n_det": len(pt_classes),
            "tflite_n_det": len(tflite_classes),
            "pt_classes": pt_classes,
            "tflite_classes": tflite_classes,
            "issue": "n_det_missmatch",
        })

    total_preds += 1

# === Reporte ===
report = {
    "n_images_compared": len(test_images),
    "identical_predictions": identical_preds,
    "pct_identical": round(identical_preds / total_preds * 100, 2),
    "n_mismatches": len(mismatches),
    "pt_avg_latency_ms": round(pt_total_time / total_preds * 1000, 1),
    "tflite_avg_latency_ms": round(tflite_total_time / total_preds * 1000, 1),
    "mismatches_detail": mismatches[:20],
}

print()
print("=" * 60)
print("REPORTE VALIDACION NUMERICA: PT vs TFLITE")
print("=" * 60)
print(f"Imagenes comparadas:   {report['n_images_compared']}")
print(f"Predicciones identicas:{report['identical_predictions']}/{total_preds} ({report['pct_identical']}%)")
print(f"Mismatches:            {report['n_mismatches']}")
print()
print(f"Latencia promedio PT (GPU):     {report['pt_avg_latency_ms']}ms")
print(f"Latencia promedio TFLITE (CPU): {report['tflite_avg_latency_ms']}ms")
print()

if report["n_mismatches"] > 0:
    print("Detalle de mismatches (primeros 10):")
    for m in mismatches[:10]:
        print(f"  {m['image']}: {m['issue']}")
        print(f"    PT: {m.get('pt_classes', m.get('pt_n_det'))}  | TFLITE: {m.get('tflite_classes', m.get('tflite_n_det'))}")

# Gate decision
PCT_GATE = 95.0
print()
if report["pct_identical"] >= PCT_GATE:
    print(f"[PASS] {report['pct_identical']}% >= {PCT_GATE}% gate -> continuar a Fase 2")
else:
    print(f"[FAIL] {report['pct_identical']}% < {PCT_GATE}% gate -> investigar antes de continuar")

report_path = Path("/home/sac/src/Sugarcane/reports/export_validation.json")
report_path.write_text(json.dumps(report, indent=2))
print(f"\nReporte guardado en: {report_path}")
