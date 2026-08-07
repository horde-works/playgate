#!/usr/bin/env python3
"""Compare prepared reference/render masks in one frozen pixel frame."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Iterable

try:
    from PIL import Image
except ImportError as error:
    raise SystemExit(
        "reference-fit requires Pillow; use the configured workspace Python "
        "or an existing interpreter that provides PIL"
    ) from error


Mask = list[bool]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Measure silhouette agreement between a reference and a canonical "
            "render. Images must already share one registered pixel frame."
        )
    )
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--render", required=True, type=Path)
    parser.add_argument("--reference-mask", type=Path)
    parser.add_argument("--render-mask", type=Path)
    parser.add_argument(
        "--reference-mode",
        choices=("dark", "light", "alpha"),
        default="dark",
        help="Foreground extraction when --reference-mask is absent.",
    )
    parser.add_argument(
        "--render-mode",
        choices=("dark", "light", "alpha"),
        default="light",
        help="Foreground extraction when --render-mask is absent.",
    )
    parser.add_argument("--reference-threshold", type=int, default=128)
    parser.add_argument("--render-threshold", type=int, default=128)
    parser.add_argument("--out-json", required=True, type=Path)
    parser.add_argument("--overlay", type=Path)
    parser.add_argument("--min-iou", type=float)
    parser.add_argument("--max-center-drift", type=float)
    parser.add_argument("--max-size-drift", type=float)
    return parser.parse_args()


def validate_threshold(value: int, label: str) -> None:
    if not 0 <= value <= 255:
        raise ValueError(f"{label} must be between 0 and 255")


def validate_unit_gate(value: float | None, label: str) -> None:
    if value is not None and not 0 <= value <= 1:
        raise ValueError(f"{label} must be between 0 and 1")


def read_rgba(path: Path) -> Image.Image:
    if not path.is_file():
        raise FileNotFoundError(path)
    return Image.open(path).convert("RGBA")


def explicit_mask(path: Path, expected_size: tuple[int, int]) -> Mask:
    image = Image.open(path).convert("L")
    if image.size != expected_size:
        raise ValueError(
            f"mask {path} is {image.size}, expected registered size {expected_size}"
        )
    return [value >= 128 for value in image.tobytes()]


def derived_mask(image: Image.Image, mode: str, threshold: int) -> Mask:
    result: Mask = []
    rgba = image.tobytes()
    for offset in range(0, len(rgba), 4):
        red, green, blue, alpha = rgba[offset : offset + 4]
        luminance = round(0.2126 * red + 0.7152 * green + 0.0722 * blue)
        if mode == "alpha":
            result.append(alpha >= threshold)
        elif mode == "dark":
            result.append(alpha > 0 and luminance < threshold)
        else:
            result.append(alpha > 0 and luminance > threshold)
    return result


def bounds(mask: Mask, width: int, height: int) -> dict[str, float | int]:
    points = [(index % width, index // width) for index, value in enumerate(mask) if value]
    if not points:
        raise ValueError("foreground mask is empty")
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    box_width = max_x - min_x + 1
    box_height = max_y - min_y + 1
    return {
        "minX": min_x,
        "minY": min_y,
        "maxX": max_x,
        "maxY": max_y,
        "width": box_width,
        "height": box_height,
        "centerX": (min_x + max_x) / 2,
        "centerY": (min_y + max_y) / 2,
    }


def centroid(mask: Mask, width: int) -> tuple[float, float]:
    count = 0
    total_x = 0
    total_y = 0
    for index, value in enumerate(mask):
        if not value:
            continue
        count += 1
        total_x += index % width
        total_y += index // width
    if count == 0:
        raise ValueError("foreground mask is empty")
    return total_x / count, total_y / count


def foreground_count(mask: Iterable[bool]) -> int:
    return sum(1 for value in mask if value)


def write_overlay(path: Path, size: tuple[int, int], reference: Mask, render: Mask) -> None:
    pixels: list[tuple[int, int, int]] = []
    for reference_value, render_value in zip(reference, render, strict=True):
        if reference_value and render_value:
            pixels.append((255, 255, 255))
        elif reference_value:
            pixels.append((255, 48, 48))
        elif render_value:
            pixels.append((0, 220, 255))
        else:
            pixels.append((0, 0, 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    output = Image.new("RGB", size)
    output.putdata(pixels)
    output.save(path)


def main() -> int:
    args = parse_args()
    validate_threshold(args.reference_threshold, "reference threshold")
    validate_threshold(args.render_threshold, "render threshold")
    validate_unit_gate(args.min_iou, "min IoU")
    validate_unit_gate(args.max_center_drift, "max center drift")
    validate_unit_gate(args.max_size_drift, "max size drift")

    reference_image = read_rgba(args.reference)
    render_image = read_rgba(args.render)
    if reference_image.size != render_image.size:
        raise ValueError(
            "reference and render sizes differ; register them into one pixel frame "
            f"before comparison ({reference_image.size} vs {render_image.size})"
        )

    size = reference_image.size
    width, height = size
    reference = (
        explicit_mask(args.reference_mask, size)
        if args.reference_mask
        else derived_mask(reference_image, args.reference_mode, args.reference_threshold)
    )
    render = (
        explicit_mask(args.render_mask, size)
        if args.render_mask
        else derived_mask(render_image, args.render_mode, args.render_threshold)
    )

    reference_count = foreground_count(reference)
    render_count = foreground_count(render)
    intersection = sum(
        1 for reference_value, render_value in zip(reference, render, strict=True)
        if reference_value and render_value
    )
    union = sum(
        1 for reference_value, render_value in zip(reference, render, strict=True)
        if reference_value or render_value
    )
    if union == 0:
        raise ValueError("reference and render masks are both empty")

    reference_bounds = bounds(reference, width, height)
    render_bounds = bounds(render, width, height)
    reference_centroid = centroid(reference, width)
    render_centroid = centroid(render, width)

    center_drift_x = abs(reference_bounds["centerX"] - render_bounds["centerX"]) / width
    center_drift_y = abs(reference_bounds["centerY"] - render_bounds["centerY"]) / height
    size_drift_x = abs(reference_bounds["width"] - render_bounds["width"]) / max(
        float(reference_bounds["width"]), 1.0
    )
    size_drift_y = abs(reference_bounds["height"] - render_bounds["height"]) / max(
        float(reference_bounds["height"]), 1.0
    )
    centroid_drift = math.hypot(
        (reference_centroid[0] - render_centroid[0]) / width,
        (reference_centroid[1] - render_centroid[1]) / height,
    )
    iou = intersection / union

    checks: list[dict[str, float | bool | str]] = []
    if args.min_iou is not None:
        checks.append(
            {"name": "silhouetteIou", "value": iou, "threshold": args.min_iou, "pass": iou >= args.min_iou}
        )
    max_center_drift = max(center_drift_x, center_drift_y)
    if args.max_center_drift is not None:
        checks.append(
            {
                "name": "bboxCenterDrift",
                "value": max_center_drift,
                "threshold": args.max_center_drift,
                "pass": max_center_drift <= args.max_center_drift,
            }
        )
    max_size_drift = max(size_drift_x, size_drift_y)
    if args.max_size_drift is not None:
        checks.append(
            {
                "name": "bboxSizeDrift",
                "value": max_size_drift,
                "threshold": args.max_size_drift,
                "pass": max_size_drift <= args.max_size_drift,
            }
        )

    passed = all(bool(check["pass"]) for check in checks)
    report = {
        "schema": "reference-fit-report.v1",
        "registeredImageSize": [width, height],
        "inputs": {
            "reference": str(args.reference),
            "render": str(args.render),
            "referenceMask": str(args.reference_mask) if args.reference_mask else None,
            "renderMask": str(args.render_mask) if args.render_mask else None,
        },
        "foregroundPixels": {"reference": reference_count, "render": render_count},
        "referenceBounds": reference_bounds,
        "renderBounds": render_bounds,
        "referenceCentroid": list(reference_centroid),
        "renderCentroid": list(render_centroid),
        "metrics": {
            "silhouetteIou": iou,
            "bboxCenterDriftX": center_drift_x,
            "bboxCenterDriftY": center_drift_y,
            "bboxCenterDriftMax": max_center_drift,
            "bboxSizeDriftX": size_drift_x,
            "bboxSizeDriftY": size_drift_y,
            "bboxSizeDriftMax": max_size_drift,
            "centroidDrift": centroid_drift,
        },
        "checks": checks,
        "pass": passed,
    }

    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    args.out_json.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if args.overlay:
        write_overlay(args.overlay, size, reference, render)
    print(json.dumps(report, indent=2))
    return 0 if passed else 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # concise CLI failure contract
        print(f"reference-fit error: {error}", file=sys.stderr)
        sys.exit(1)
