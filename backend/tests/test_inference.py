from pathlib import Path

from app.inference import run_inference


def test_run_inference_returns_structure():
    """Test that run_inference returns expected keys."""
    test_img_dir = Path(__file__).resolve().parents[2] / "dataset" / "test" / "images"
    images = sorted(test_img_dir.glob("*.jpg"))
    if not images:
        import pytest
        pytest.skip("No test images available")

    image_bytes = images[0].read_bytes()
    result = run_inference(image_bytes)

    assert "detections" in result
    assert "n_detections" in result
    assert "latency_ms" in result
    assert "image_shape" in result
    assert "model" in result
    assert "device" in result
    assert result["model"] == "Yolo26m-seg"
    assert isinstance(result["detections"], list)
    assert isinstance(result["latency_ms"], (int, float))
    assert len(result["image_shape"]) == 2


def test_run_inference_detections_have_expected_fields():
    test_img_dir = Path(__file__).resolve().parents[2] / "dataset" / "test" / "images"
    images = sorted(test_img_dir.glob("*.jpg"))
    if not images:
        import pytest
        pytest.skip("No test images available")

    image_bytes = images[0].read_bytes()
    result = run_inference(image_bytes)

    if len(result["detections"]) > 0:
        det = result["detections"][0]
        assert "class_id" in det
        assert "class_name" in det
        assert "confidence" in det
        assert "bbox" in det
        assert len(det["bbox"]) == 4
        assert isinstance(det["class_name"], str)
