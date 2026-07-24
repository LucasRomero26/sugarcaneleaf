import warnings
from pathlib import Path
from collections import defaultdict

warnings.filterwarnings("ignore")
from ultralytics import YOLO

MODEL_PATH = "/home/sac/src/Sugarcane/models/Yolo26m-seg.pt"
TEST_DIR = Path("/home/sac/src/Sugarcane/dataset/test/images")
OUT_DIR = Path("/home/sac/src/Sugarcane/reports/predictions")
OUT_DIR.mkdir(parents=True, exist_ok=True)

print("Cargando modelo...")
model = YOLO(MODEL_PATH)

# Agrupar imagenes de test por prefijo del nombre (case-insensitive)
# Prefijos reales: Healthy, Mosaic, RedRot, Rust, Yellow
class_images = defaultdict(list)
prefix_to_class = {
    "healthy": "healthy",
    "mosaic": "mosaic",
    "redrot": "red_rot",
    "rust": "rust",
    "yellow": "yellow",
}

for img in sorted(TEST_DIR.iterdir()):
    name_lower = img.stem.lower()
    for prefix, cls in prefix_to_class.items():
        if name_lower.startswith(prefix):
            class_images[cls].append(img)
            break

print("Distribucion de test por clase:")
for cls in ["healthy", "mosaic", "red_rot", "rust", "yellow"]:
    print(f"  {cls:10s}: {len(class_images[cls])} imagenes")

# Tomar 1 imagen del medio de cada clase para el README (5 total)
selected = []
for cls in ["healthy", "mosaic", "red_rot", "rust", "yellow"]:
    if class_images[cls]:
        imgs = class_images[cls]
        idx = len(imgs) // 2
        selected.append((cls, imgs[idx]))

print(f"\nGenerando predicciones para {len(selected)} imagenes seleccionadas...")

for cls, img_path in selected:
    results = model.predict(
        source=str(img_path),
        save=True,
        project=str(OUT_DIR),
        name=f"pred_{cls}",
        exist_ok=True,
        conf=0.25,
        verbose=False,
    )
    pred_dir = OUT_DIR / f"pred_{cls}"
    saved_imgs = list(pred_dir.glob("*.jpg"))
    if saved_imgs:
        final = pred_dir / f"{cls}_prediction.jpg"
        saved_imgs[0].rename(final)
        print(f"  {cls:10s} -> {final}")

print("\nPredicciones guardadas en:", OUT_DIR)
