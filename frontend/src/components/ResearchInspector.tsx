"use client";

import { useEffect, useRef } from "react";

interface ResearchInspectorProps {
  overlay: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function ResearchInspector({
  overlay,
  onClose,
  children,
}: ResearchInspectorProps) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!overlay) return;
    const trigger =
      document.activeElement instanceof HTMLElement ||
      document.activeElement instanceof SVGElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [overlay]);

  return (
    <>
      {overlay && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          aria-hidden="true"
          onClick={onClose}
        />
      )}
      <div
        ref={panel}
        data-testid="compare-fold-sheet"
        role={overlay ? "dialog" : "complementary"}
        aria-modal={overlay || undefined}
        aria-label="Selected fold inspector"
        className={
          overlay
            ? "fixed inset-x-0 bottom-0 z-50 max-h-[86dvh] overflow-y-auto overscroll-contain rounded-t-xl border-t border-action bg-surface p-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[min(540px,calc(100vw-32px))] sm:rounded-xl"
            : "workspace-inspector min-w-0"
        }
        onKeyDown={(event) => {
          if (!overlay) return;
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if (event.key === "Tab") {
            const focusable = panel.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]),select:not([disabled]),input:not([disabled]),a[href],[tabindex="0"]',
            );
            if (!focusable?.length) return;
            const first = focusable[0],
              last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle pb-3 mb-4">
          <span className="text-xs uppercase tracking-wider font-mono text-muted">
            Decision boundary
          </span>
          {overlay && (
            <button
              type="button"
              onClick={onClose}
              data-testid="close-inspector"
              className="ripple-btn ripple-btn-secondary rounded-lg px-3"
            >
              Close inspector
            </button>
          )}
        </div>
        {children}
      </div>
    </>
  );
}
