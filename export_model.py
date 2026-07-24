import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
from ultralytics import YOLO

MODEL_PATH = "/home/sac/src/Sugarcane/models/Yolo26m-seg.pt"
MODELS_DIR = Path("/home/sac/src/Sugarcane/models")

print("=" * 60)
print("EXPORT PRIMARIO: LiteRT (.tflite) con end2end=False")
print("=" * 60)
print()
print("Cargando modelo PyTorch...")
model = YOLO(MODEL_PATH)
print(f"  task: {model.task}")
print(f"  end2end en yaml: {model.model.yaml.get('end2end')}")
print()

print("Exportando a LiteRT con end2end=False...")
print("  (fuerza head estandar, NMS corre en runtime JS de Ultralytics)")
try:
    path = model.export(format="litert", end2end=False, imgsz=640)
    print(f"  OK -> {path}")
    print(f"  Tamano: {Path(path).stat().st_size / 1024 / 1024:.1f} MB")
except Exception as e:
    print(f"  FALLO: {type(e).__name__}: {e}")
    print("  Se intentara export sin end2end kwarg (puede usar default)")
    try:
        path = model.export(format="litert", imgsz=640)
        print(f"  OK (sin end2end kwarg) -> {path}")
        print(f"  Tamano: {Path(path).stat().st_size / 1024 / 1024:.1f} MB")
    except Exception as e2:
        print(f"  FALLO tambien sin kwarg: {e2}")

print()
print("=" * 60)
print("EXPORT FALLBACK: ONNX (opset=12, dynamic=True)")
print("=" * 60)
print()
print("Exportando a ONNX...")
try:
    path_onnx = model.export(format="onnx", opset=12, dynamic=True, imgsz=640)
    print(f"  OK -> {path_onnx}")
    print(f"  Tamano: {Path(path_onnx).stat().st_size / 1024 / 1024:.1f} MB")
except Exception as e:
    print(f"  FALLO: {type(e).__name__}: {e}")

print()
print("=" * 60)
print("ARCHIVOS GENERADOS en models/:")
print("=" * 60)
for f in sorted(MODELS_DIR.iterdir()):
    if f.is_file() and not f.name.endswith(":Zone.Identifier"):
        print(f"  {f.name:30s} {f.stat().st_size / 1024 / 1024:>8.1f} MB")
