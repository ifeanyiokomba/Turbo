"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface PinDialogHandle {
  request: (opts?: { title?: string; description?: string }) => Promise<string>;
}

const PinContext = React.createContext<PinDialogHandle | null>(null);

export function usePin() {
  const ctx = React.useContext(PinContext);
  if (!ctx) throw new Error("usePin must be used within PinDialogProvider");
  return ctx;
}

export function PinDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("Enter PIN");
  const [description, setDescription] = React.useState("Confirm this transaction");
  const [value, setValue] = React.useState("");
  const resolver = React.useRef<((v: string) => void) | null>(null);

  const request = React.useCallback<PinDialogHandle["request"]>((opts) => {
    setTitle(opts?.title ?? "Enter PIN");
    setDescription(opts?.description ?? "Confirm this transaction");
    setValue("");
    setOpen(true);
    return new Promise<string>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function submit(v: string) {
    if (v.length !== 4) return;
    setOpen(false);
    resolver.current?.(v);
    resolver.current = null;
  }

  return (
    <PinContext.Provider value={{ request }}>
      {children}
      <Dialog open={open} onOpenChange={(o) => {
        setOpen(o);
        if (!o && resolver.current) {
          resolver.current("");
          resolver.current = null;
        }
      }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-center">{title}</DialogTitle>
            <DialogDescription className="text-center">{description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <InputOTP
              maxLength={4}
              value={value}
              onChange={(v) => {
                setValue(v);
                if (v.length === 4) setTimeout(() => submit(v), 150);
              }}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
              </InputOTPGroup>
            </InputOTP>
            <p className="text-xs text-muted-foreground">Enter your 4-digit transaction PIN</p>
          </div>
        </DialogContent>
      </Dialog>
    </PinContext.Provider>
  );
}
