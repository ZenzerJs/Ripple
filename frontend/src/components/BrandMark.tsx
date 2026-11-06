import React from "react";

/** Open ripples intersect a decision boundary: forecast, decision, consequence. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M31.8 8.2A16.7 16.7 0 1 0 31.8 31.8M28.3 11.7a11.7 11.7 0 1 0 0 16.6M24.7 15.3a6.7 6.7 0 1 0 0 9.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M20 5v30"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity=".55"
      />
      <circle cx="20" cy="20" r="2.3" fill="currentColor" />
    </svg>
  );
}
