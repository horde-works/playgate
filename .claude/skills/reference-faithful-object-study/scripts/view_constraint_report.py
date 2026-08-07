#!/usr/bin/env python3
"""Check calibrated shared axes and visible part counts across strict views."""

from __future__ import annotations

import argparse
import itertools
import json
import sys
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Report contradictions between calibrated orthographic reference views."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--tolerance", type=float)
    return parser.parse_args()


def positive_number(value: Any, label: str) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
        raise ValueError(f"{label} must be a positive number")
    return float(value)


def relative_delta(left: float, right: float) -> float:
    return abs(left - right) / max(abs(left), abs(right), 1e-12)


def main() -> int:
    args = parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(data.get("views"), dict) or not data["views"]:
        raise ValueError("input must contain a non-empty views object")
    tolerance = args.tolerance if args.tolerance is not None else data.get("tolerance", 0.03)
    if not isinstance(tolerance, (int, float)) or tolerance < 0:
        raise ValueError("tolerance must be a non-negative number")
    tolerance = float(tolerance)
    authority = data.get("authority", {})
    if not isinstance(authority, dict):
        raise ValueError("authority must be an object when present")

    warnings: list[str] = []
    eligible: dict[str, dict[str, Any]] = {}
    for view_id, view in data["views"].items():
        if not isinstance(view, dict):
            raise ValueError(f"view {view_id} must be an object")
        projection = view.get("projection")
        calibrated = view.get("calibrated", False)
        if projection != "orthographic" or calibrated is not True:
            warnings.append(
                f"{view_id}: ignored for rigid shared-axis equality "
                f"(projection={projection!r}, calibrated={calibrated!r})"
            )
            continue
        axes = view.get("axes", {})
        counts = view.get("counts", {})
        if not isinstance(axes, dict) or not isinstance(counts, dict):
            raise ValueError(f"view {view_id}: axes and counts must be objects")
        eligible[view_id] = {"axes": axes, "counts": counts}

    axis_values: dict[str, list[tuple[str, float]]] = {}
    count_values: dict[str, list[tuple[str, int]]] = {}
    for view_id, view in eligible.items():
        for axis, raw_value in view["axes"].items():
            value = positive_number(raw_value, f"{view_id}.axes.{axis}")
            axis_values.setdefault(axis, []).append((view_id, value))
        for part_name, raw_count in view["counts"].items():
            if not isinstance(raw_count, int) or isinstance(raw_count, bool) or raw_count < 0:
                raise ValueError(f"{view_id}.counts.{part_name} must be a non-negative integer")
            count_values.setdefault(part_name, []).append((view_id, raw_count))

    comparisons: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []

    for axis, values in sorted(axis_values.items()):
        for (left_view, left_value), (right_view, right_value) in itertools.combinations(values, 2):
            delta = relative_delta(left_value, right_value)
            conflict = delta > tolerance
            resolution = authority.get(axis)
            item = {
                "kind": "axis",
                "name": axis,
                "left": {"view": left_view, "value": left_value},
                "right": {"view": right_view, "value": right_value},
                "relativeDelta": delta,
                "tolerance": tolerance,
                "conflict": conflict,
                "authority": resolution,
                "resolved": bool(conflict and resolution),
            }
            comparisons.append(item)
            if conflict:
                conflicts.append(item)
                if not resolution:
                    unresolved.append(item)

    for part_name, values in sorted(count_values.items()):
        for (left_view, left_count), (right_view, right_count) in itertools.combinations(values, 2):
            conflict = left_count != right_count
            authority_key = f"count:{part_name}"
            resolution = authority.get(authority_key)
            item = {
                "kind": "count",
                "name": part_name,
                "left": {"view": left_view, "value": left_count},
                "right": {"view": right_view, "value": right_count},
                "conflict": conflict,
                "authority": resolution,
                "resolved": bool(conflict and resolution),
            }
            comparisons.append(item)
            if conflict:
                conflicts.append(item)
                if not resolution:
                    unresolved.append(item)

    report = {
        "schema": "view-constraint-report.v1",
        "inputSchema": data.get("schema"),
        "unit": data.get("unit"),
        "tolerance": tolerance,
        "eligibleViews": sorted(eligible),
        "warnings": warnings,
        "comparisons": comparisons,
        "conflicts": conflicts,
        "unresolvedConflicts": unresolved,
        "status": "pass" if not unresolved else "requires-resolution",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if not unresolved else 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(f"view-constraint error: {error}", file=sys.stderr)
        sys.exit(1)
