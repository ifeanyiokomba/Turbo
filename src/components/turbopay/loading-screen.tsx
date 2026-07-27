"use client";

import * as React from "react";
import { Logo, Wordmark } from "./logo";

export function LoadingScreen() {
  return (
    <div className="bg-background fixed inset-0 z-[100] flex flex-col items-center justify-center">
      <div className="flex items-center gap-3">
        <div className="tp-fade-rise">
          <Logo size={56} className="tp-bolt-glow" />
        </div>
        <div className="flex items-end overflow-hidden">
          {"Turbopay".split("").map((ch, i) => (
            <span
              key={i}
              className="tp-fade-rise text-3xl font-bold tracking-tight"
              style={{
                animationDelay: `${i * 70}ms`,
                color: i >= 4 ? "var(--primary)" : "var(--foreground)",
              }}
            >
              {ch}
            </span>
          ))}
        </div>
      </div>
      <div className="bg-muted mt-8 h-1 w-40 overflow-hidden rounded-full">
        <div className="tp-sheen bg-primary h-full w-full" />
      </div>
      <p className="text-muted-foreground mt-4 text-xs">The fast lane to your money</p>
    </div>
  );
}
