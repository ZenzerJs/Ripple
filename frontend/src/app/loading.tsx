import React from "react";

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading run export"
      data-testid="viewer-loading-skeleton"
      className="min-h-screen bg-canvas text-text"
    >
      <div className="border-b border-border-subtle py-4 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-container flex items-center justify-between">
          <div className="h-7 w-28 rounded-lg bg-raised animate-pulse" />
          <div className="flex gap-3">
            <div className="h-8 w-20 rounded-lg bg-raised animate-pulse" />
            <div className="h-8 w-20 rounded-lg bg-raised animate-pulse" />
            <div className="h-8 w-20 rounded-lg bg-raised animate-pulse" />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-container px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="space-y-3">
          <div className="h-4 w-64 rounded bg-raised animate-pulse" />
          <div className="h-10 w-3/4 rounded-lg bg-raised animate-pulse" />
          <div className="h-5 w-1/2 rounded bg-raised animate-pulse" />
        </div>

        <div className="ripple-card p-8 space-y-4">
          <div className="h-4 w-32 rounded bg-raised animate-pulse" />
          <div className="h-8 w-2/3 rounded bg-raised animate-pulse" />
          <div className="h-6 w-1/2 rounded bg-raised animate-pulse" />
          <div className="flex gap-3 pt-2">
            <div className="h-11 w-44 rounded-lg bg-raised animate-pulse" />
            <div className="h-11 w-36 rounded-lg bg-raised animate-pulse" />
          </div>
        </div>

        <div className="ripple-card p-8 space-y-4">
          <div className="h-6 w-56 rounded bg-raised animate-pulse" />
          <div className="h-64 w-full rounded-xl bg-raised animate-pulse" />
        </div>
      </main>
    </div>
  );
}
