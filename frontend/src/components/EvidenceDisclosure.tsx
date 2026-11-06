"use client";

import React, { useState } from "react";
import { AuditSource, RunStatus } from "@/lib/schema";

interface EvidenceDisclosureProps {
  runId: string;
  schemaVersion: string;
  status: RunStatus;
  source: AuditSource;
  limitations: string[];
  defaultExpanded?: boolean;
}

export function EvidenceDisclosure({
  runId,
  schemaVersion,
  status,
  source,
  limitations,
  defaultExpanded = false,
}: EvidenceDisclosureProps) {
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (label: string, val: string) => {
    try {
      navigator.clipboard?.writeText(val);
    } catch {
      // ignore clipboard permission errors in headless environments
    }
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1200);
  };

  return (
    <section
      aria-label="Provenance and methodology disclosure"
      data-testid="evidence-disclosure"
      className="ripple-card p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-[18px] font-bold text-text">
            Evidence provenance &amp; temporal methodology
          </h3>
          <p className="text-[14px] text-muted mt-0.5">
            Cryptographic data hash, repository commit, decision-time cutoff rule,
            and exclusion protocol.
          </p>
        </div>

        <button
          type="button"
          data-testid="evidence-disclosure-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="ripple-btn ripple-btn-secondary rounded-lg px-4 py-2 text-[14px]"
        >
          {expanded ? "Hide provenance details" : "Inspect provenance & hashes"}
        </button>
      </div>

      {expanded && (
        <div
          data-testid="evidence-disclosure-content"
          className="mt-6 pt-6 border-t border-border-subtle space-y-6 ripple-enter"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-raised/60 border border-border-subtle p-4">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-1">
                Dataset SHA-256 Checksum
              </div>
              <div className="flex items-center justify-between gap-2">
                <code
                  data-testid="provenance-data-sha256"
                  className="font-mono text-[13px] text-text break-all"
                >
                  {source.data_sha256}
                </code>
                <button
                  type="button"
                  data-testid="copy-data-hash"
                  onClick={() => handleCopy("data_sha256", source.data_sha256)}
                  className={`ripple-btn ripple-btn-secondary rounded-md px-2.5 py-1 text-[12px] min-h-[34px] shrink-0 ${
                    copiedField === "data_sha256" ? "ripple-pulse-success border-ok" : ""
                  }`}
                >
                  {copiedField === "data_sha256" ? "Copied ✓" : "Copy"}
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-raised/60 border border-border-subtle p-4">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-1">
                Repository Commit SHA
              </div>
              <div className="flex items-center justify-between gap-2">
                <code
                  data-testid="provenance-repo-commit"
                  className="font-mono text-[13px] text-text break-all"
                >
                  {source.repo_commit}
                </code>
                <button
                  type="button"
                  data-testid="copy-commit-sha"
                  onClick={() => handleCopy("repo_commit", source.repo_commit)}
                  className={`ripple-btn ripple-btn-secondary rounded-md px-2.5 py-1 text-[12px] min-h-[34px] shrink-0 ${
                    copiedField === "repo_commit" ? "ripple-pulse-success border-ok" : ""
                  }`}
                >
                  {copiedField === "repo_commit" ? "Copied ✓" : "Copy"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[14px]">
            <div className="rounded-lg border border-border-subtle p-3">
              <div className="text-[12px] text-muted">Run ID</div>
              <div className="font-mono text-[13px] font-semibold text-text mt-0.5">
                {runId}
              </div>
            </div>
            <div className="rounded-lg border border-border-subtle p-3">
              <div className="text-[12px] text-muted">Schema &amp; Status</div>
              <div className="font-mono text-[13px] font-semibold text-text mt-0.5">
                v{schemaVersion} · {status}
              </div>
            </div>
            <div className="rounded-lg border border-border-subtle p-3">
              <div className="text-[12px] text-muted">Instrument &amp; Cadence</div>
              <div className="font-mono text-[13px] font-semibold text-text mt-0.5">
                {source.ticker} · {source.frequency}
              </div>
            </div>
            <div className="rounded-lg border border-border-subtle p-3">
              <div className="text-[12px] text-muted">Decision Cutoff Rule</div>
              <div className="font-mono text-[13px] font-semibold text-text mt-0.5">
                {source.decision_time}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-[15px] font-semibold text-text">
              Declared limitations &amp; exclusion rules
            </h4>
            <ul className="list-disc pl-5 space-y-2 text-[14px] text-muted max-w-prose">
              {limitations.map((lim, i) => (
                <li key={i}>{lim}</li>
              ))}
              <li>
                <strong>Reconciliation command:</strong> Run{" "}
                <code className="font-mono text-[12px] text-text">
                  uv run --frozen ripple export-viewer --output frontend/public/runs
                </code>{" "}
                to regenerate all viewer exports deterministically from frozen
                snapshots.
              </li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
