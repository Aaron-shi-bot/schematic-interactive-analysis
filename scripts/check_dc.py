#!/usr/bin/env python3
"""Check an already-computed complete DC snapshot; this is not a circuit solver."""
import argparse
import json
import math
import sys
from pathlib import Path


def number(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label}: expected a numeric SI value")
    try:
        result = float(value)
    except OverflowError as exc:
        raise ValueError(f"{label}: value exceeds numeric range") from exc
    if not math.isfinite(result):
        raise ValueError(f"{label}: value must be finite")
    return result


def check_case(data, *, rtol=1e-6, voltage_atol=1e-8, current_atol=1e-10, power_atol=1e-10):
    limits = {"rtol": rtol, "voltage_atol": voltage_atol, "current_atol": current_atol, "power_atol": power_atol}
    for key, value in limits.items():
        if number(value, key) < 0:
            raise ValueError(f"{key}: must be nonnegative")
    if not isinstance(data, dict):
        raise ValueError("snapshot must be an object")
    if data.get("analysis") != "dc_operating_point" or data.get("complete_network") is not True:
        raise ValueError("requires analysis=dc_operating_point and complete_network=true")
    raw_nodes = data.get("nodes")
    if not isinstance(raw_nodes, dict) or not raw_nodes:
        raise ValueError("nodes must be a nonempty object")
    if any(not isinstance(n, str) or not n for n in raw_nodes):
        raise ValueError("node IDs must be nonempty strings")
    nodes = {n: number(v, f"node {n}") for n, v in raw_nodes.items()}
    ref = data.get("reference_node")
    if not isinstance(ref, str) or ref not in nodes:
        raise ValueError("reference_node must identify an existing node")
    branches = data.get("branches")
    if not isinstance(branches, list) or not branches:
        raise ValueError("branches must be a nonempty list")
    ids = set()
    currents = {n: [] for n in nodes}
    graph = {n: set() for n in nodes}
    powers = []
    checks = []
    unverified = []

    def compare(label, actual, expected, atol):
        actual = number(actual, label)
        expected = number(expected, label)
        residual = number(actual - expected, label + " residual")
        threshold = number(atol + rtol * max(abs(actual), abs(expected)), label + " threshold")
        checks.append({"check": label, "ok": abs(residual) <= threshold,
                       "residual": residual, "limit": threshold})

    compare("reference_voltage", nodes[ref], 0.0, voltage_atol)
    for branch in branches:
        if not isinstance(branch, dict):
            raise ValueError("every branch must be an object")
        bid = branch.get("id")
        if not isinstance(bid, str) or not bid or bid in ids:
            raise ValueError("branch IDs must be nonempty and unique")
        ids.add(bid)
        p, n = branch.get("p"), branch.get("n")
        if not isinstance(p, str) or not isinstance(n, str) or p not in nodes or n not in nodes or p == n:
            raise ValueError(f"{bid}: p/n must be different existing node IDs")
        kind = branch.get("kind")
        if kind not in {"resistor", "voltage_source", "current_source", "model"}:
            raise ValueError(f"{bid}: unsupported branch kind {kind!r}")
        current = number(branch.get("current"), f"{bid}.current")
        voltage = number(nodes[p] - nodes[n], f"{bid}.voltage")
        currents[p].append(current)
        currents[n].append(-current)
        graph[p].add(n)
        graph[n].add(p)
        power = number(voltage * current, f"{bid}.power")
        powers.append(power)
        if "power" in branch:
            compare(f"{bid}: supplied_power", branch["power"], power, power_atol)
        if kind == "model":
            unverified.append(bid)
            continue
        value = number(branch.get("value"), f"{bid}.value")
        if kind == "resistor":
            if value <= 0:
                raise ValueError(f"{bid}: resistance must be positive; model ideal shorts explicitly")
            compare(f"{bid}: ohms_law", current, number(voltage / value, f"{bid}.expected_current"), current_atol)
        elif kind == "voltage_source":
            compare(f"{bid}: source_voltage", voltage, value, voltage_atol)
        else:
            compare(f"{bid}: source_current", current, value, current_atol)

    reached = {ref}
    pending = [ref]
    while pending:
        for neighbor in graph[pending.pop()]:
            if neighbor not in reached:
                reached.add(neighbor)
                pending.append(neighbor)
    if reached != set(nodes):
        raise ValueError("nodes disconnected from reference: " + ", ".join(sorted(set(nodes) - reached)))
    for node, items in currents.items():
        residual = number(math.fsum(items), f"KCL {node}")
        scale = number(math.fsum(abs(i) for i in items), f"KCL {node} scale")
        limit = number(current_atol + rtol * scale, f"KCL {node} threshold")
        checks.append({"check": f"KCL:{node}", "ok": abs(residual) <= limit,
                       "residual": residual, "limit": limit})
    residual = number(math.fsum(powers), "power balance")
    limit = number(power_atol + rtol * math.fsum(abs(p) for p in powers), "power balance threshold")
    checks.append({"check": "power_balance", "ok": abs(residual) <= limit,
                   "residual": residual, "limit": limit})
    failures = [c for c in checks if not c["ok"]]
    return {"name": data.get("name", ""), "status": "fail" if failures else "pass",
            "scope": "Numerical DC consistency only; topology extraction and physical model accuracy not verified",
            "branch_model_laws_not_checked": unverified,
            "limits": limits, "checks": checks, "failures": failures}


def invalid_constant(value):
    raise ValueError(f"non-finite JSON constant: {value}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--rtol", type=float, default=1e-6)
    parser.add_argument("--voltage-atol", type=float, default=1e-8)
    parser.add_argument("--current-atol", type=float, default=1e-10)
    parser.add_argument("--power-atol", type=float, default=1e-10)
    args = parser.parse_args()
    try:
        data = json.loads(args.snapshot.read_text(encoding="utf-8-sig"), parse_constant=invalid_constant)
        cases = data.get("cases") if isinstance(data, dict) and "cases" in data else [data]
        if not isinstance(cases, list) or not cases:
            raise ValueError("cases must be a nonempty list")
        kwargs = {k: getattr(args, k) for k in ("rtol", "voltage_atol", "current_atol", "power_atol")}
        reports = [check_case(case, **kwargs) for case in cases]
        ok = all(report["status"] == "pass" for report in reports)
        print(json.dumps({"status": "pass" if ok else "fail", "cases": reports}, ensure_ascii=False, allow_nan=False, indent=2))
        return 0 if ok else 1
    except (OSError, ValueError, OverflowError, TypeError, KeyError) as exc:
        print(json.dumps({"status": "invalid", "error": str(exc)}, ensure_ascii=False, allow_nan=False))
        return 2


if __name__ == "__main__":
    sys.exit(main())
