"use client";
import * as React from "react";
export function makeStub(title: string, desc: string) {
  return function StubView() {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="bg-primary/10 text-primary flex h-16 w-16 items-center justify-center rounded-2xl">
          <span className="text-2xl">⚡</span>
        </div>
        <h2 className="mt-4 text-xl font-bold">{title}</h2>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">{desc}</p>
      </div>
    );
  };
}
