"use client";

// Session timeout hook for Turbopay.
// Tracks user activity (mousemove, keydown, click, scroll) and warns before
// automatically signing the user out after a long period of inactivity.
//
// Defaults:
//   - Inactivity threshold: 15 minutes
//   - Warning window: 2 minutes (countdown shown to the user)
//
// On timeout, the caller's `onTimeout` is invoked — the AppShell wires this
// to a full server logout + client state clear + router refresh.

import * as React from "react";

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "keydown",
  "click",
  "scroll",
  "touchstart",
  "wheel",
];

export interface UseSessionTimeoutOptions {
  /** Inactivity threshold before the warning dialog opens (ms). */
  inactivityMs?: number;
  /** Length of the countdown shown in the warning dialog (ms). */
  warningMs?: number;
  /** Called when the countdown reaches zero. */
  onTimeout: () => void;
  /** Disable the timer entirely (e.g. on auth-gated pages where user is null). */
  enabled?: boolean;
}

export interface SessionTimeoutState {
  /** True when the warning dialog should be shown. */
  warning: boolean;
  /** Seconds remaining before automatic logout. */
  secondsLeft: number;
  /** Reset the inactivity timer (e.g. on "Stay signed in"). */
  staySignedIn: () => void;
  /** Force an immediate logout. */
  signOutNow: () => void;
}

export function useSessionTimeout({
  inactivityMs = 15 * 60 * 1000,
  warningMs = 2 * 60 * 1000,
  onTimeout,
  enabled = true,
}: UseSessionTimeoutOptions): SessionTimeoutState {
  const [warning, setWarning] = React.useState(false);
  const [secondsLeft, setSecondsLeft] = React.useState(Math.floor(warningMs / 1000));

  // Refs to avoid re-running the effect when callbacks change
  const onTimeoutRef = React.useRef(onTimeout);
  React.useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const lastActivity = React.useRef<number>(Date.now());
  const idleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = React.useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
  }, []);

  const startCountdown = React.useCallback(() => {
    setWarning(true);
    setSecondsLeft(Math.floor(warningMs / 1000));
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    countdownTimer.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          // Time's up
          if (countdownTimer.current) clearInterval(countdownTimer.current);
          countdownTimer.current = null;
          setWarning(false);
          // Defer to avoid setState-in-render warnings
          setTimeout(() => onTimeoutRef.current(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [warningMs]);

  const scheduleIdle = React.useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      startCountdown();
    }, inactivityMs);
  }, [inactivityMs, startCountdown]);

  const reset = React.useCallback(() => {
    lastActivity.current = Date.now();
    if (warning) {
      setWarning(false);
    }
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
    scheduleIdle();
  }, [scheduleIdle, warning]);

  const staySignedIn = React.useCallback(() => {
    reset();
  }, [reset]);

  const signOutNow = React.useCallback(() => {
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
    setWarning(false);
    setTimeout(() => onTimeoutRef.current(), 0);
  }, []);

  // Activity listener
  React.useEffect(() => {
    if (!enabled) {
      clearTimers();
      return;
    }

    const handler = () => {
      // Only reset if we're not in the warning window. During the warning,
      // activity should NOT dismiss the dialog — the user must explicitly
      // click "Stay signed in".
      if (warning) return;
      lastActivity.current = Date.now();
      scheduleIdle();
    };

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, handler, { passive: true });
    }

    // Kick off the initial idle timer
    scheduleIdle();

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, handler);
      }
      clearTimers();
    };
  }, [enabled, warning, scheduleIdle, clearTimers]);

  return { warning, secondsLeft, staySignedIn, signOutNow };
}
