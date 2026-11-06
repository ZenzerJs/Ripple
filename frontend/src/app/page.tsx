import crypto from "crypto";
import fs from "fs";
import path from "path";
import React from "react";
import { PortfolioReplayBundle, RunIndexManifest } from "@/lib/schema";
import { RippleViewer } from "@/components/RippleViewer";

export default function HomePage() {
  const runsDir = path.join(process.cwd(), "public", "runs");
  const indexRaw = fs.readFileSync(path.join(runsDir, "index.json"), "utf-8");
  const indexManifest = JSON.parse(indexRaw) as RunIndexManifest;

  const runsByFile: Record<string, unknown> = {};
  const hashesByFile: Record<string, string> = {};
  for (const entry of indexManifest.runs) {
    const filePath = path.join(runsDir, entry.file);
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      hashesByFile[entry.file] = crypto
        .createHash("sha256")
        .update(buf)
        .digest("hex");
      runsByFile[entry.file] = JSON.parse(buf.toString("utf-8"));
    }
  }

  let labBundle: PortfolioReplayBundle | null = null;
  if (indexManifest.lab_bundle_file) {
    const labPath = path.join(runsDir, indexManifest.lab_bundle_file);
    if (fs.existsSync(labPath)) {
      labBundle = JSON.parse(
        fs.readFileSync(labPath, "utf-8")
      ) as PortfolioReplayBundle;
    }
  }

  return (
    <RippleViewer
      initialIndex={indexManifest}
      initialRunsByFile={runsByFile}
      initialHashesByFile={hashesByFile}
      initialLabBundle={labBundle}
    />
  );
}
