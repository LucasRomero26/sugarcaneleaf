import json
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
from ultralytics import YOLO

print("Cargando modelo...")
model = YOLO("/home/sac/src/Sugarcane/models/Yolo26m-seg.pt")
print(f"Modelo cargado. Task: {model.task}")
print()

print("Corriendo validacion sobre test set (255 imagenes)...")
metrics = model.val(
    data="/home/sac/src/Sugarcane/dataset/data.abs.yaml",
    split="test",
    plots=True,
    save_json=True,
    project="reports",
    name="val_run",
    exist_ok=True,
    verbose=False,
)

# Ultralytics 8.4.x: metrics.seg_mask en lugar de metrics.mask
mask_metric = None
if hasattr(metrics, "seg") and metrics.seg is not None:
    mask_metric = metrics.seg
elif hasattr(metrics, "mask") and metrics.mask is not None:
    mask_metric = metrics.mask

box = metrics.box
results = {
    "model_path": "models/Yolo26m-seg.pt",
    "task": model.task,
    "classes": model.names,
    "nc": len(model.names),
    "split": "test",
    "n_images": 255,
    "box": {
        "map50": float(box.map50),
        "map50_95": float(box.map),
        "map75": float(box.map75),
        "mp": float(box.mp),
        "mr": float(box.mr),
        "precision_per_class": [float(x) for x in box.p],
        "recall_per_class": [float(x) for x in box.r],
        "ap50_per_class": [float(x) for x in box.ap50],
        "ap_per_class": [float(x) for x in box.ap],
        "maps_per_class": [float(x) for x in box.maps],
    },
    "mask": {
        "map50": float(mask_metric.map50),
        "map50_95": float(mask_metric.map),
        "map75": float(mask_metric.map75),
        "mp": float(mask_metric.mp),
        "mr": float(mask_metric.mr),
        "precision_per_class": [float(x) for x in mask_metric.p],
        "recall_per_class": [float(x) for x in mask_metric.r],
        "ap50_per_class": [float(x) for x in mask_metric.ap50],
        "ap_per_class": [float(x) for x in mask_metric.ap],
        "maps_per_class": [float(x) for x in mask_metric.maps],
    } if mask_metric is not None else None,
}

report_path = Path("reports/val_metrics.json")
report_path.write_text(json.dumps(results, indent=2))

print()
print("=== RESULTADOS ===")
print(f"BOX  mAP@0.5:       {results['box']['map50']:.4f}")
print(f"BOX  mAP@0.5:0.95:  {results['box']['map50_95']:.4f}")
print(f"BOX  Precision:     {results['box']['mp']:.4f}")
print(f"BOX  Recall:        {results['box']['mr']:.4f}")
print()
if results.get("mask"):
    print(f"MASK mAP@0.5:       {results['mask']['map50']:.4f}")
    print(f"MASK mAP@0.5:0.95:  {results['mask']['map50_95']:.4f}")
    print(f"MASK Precision:     {results['mask']['mp']:.4f}")
    print(f"MASK Recall:        {results['mask']['mr']:.4f}")
print()
print("Per-class mAP@0.5 (Box):")
for i, name in model.names.items():
    print(f"  {name:10s}: {results['box']['maps_per_class'][i]:.4f}")
print()
print(f"Guardado en: {report_path}")
