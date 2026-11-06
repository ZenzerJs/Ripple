"""Refresh label-maturity exports without replacing independent portfolio evidence."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from ripple.viewer_export import ROOT, export_all_viewer_runs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    args = parser.parse_args()
    staging = ROOT / "artifacts" / "viewer-experiment-refresh"
    output = ROOT / "frontend" / "public" / "runs"
    # The monthly experiment and the five-session portfolio lab are separate
    # experiments with separate dataset hashes. Never rebuild the lab from
    # missing private forecast/replay inputs while refreshing the monthly case.
    lab_before = (output / "ripple-phase4b-to-6-lab.json").read_bytes()
    manifest = export_all_viewer_runs(staging, snapshot_dir=args.snapshot)
    for entry in manifest["runs"]:
        shutil.copyfile(staging / entry["file"], output / entry["file"])
    shutil.copyfile(staging / "index.json", output / "index.json")
    assert (output / "ripple-phase4b-to-6-lab.json").read_bytes() == lab_before
    print(json.dumps({"output": str(output), "portfolio_lab": "unchanged"}, indent=2))


if __name__ == "__main__":
    main()
