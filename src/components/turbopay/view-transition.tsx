"use client";

import * as React from "react";
import { motion } from "framer-motion";

/**
 * ViewTransition — wraps view content and animates a fade + slight slide-up
 * whenever `viewKey` changes (i.e. on every view switch in the app shell).
 *
 * Animation: opacity 0 → 1, y 12 → 0, 0.25s ease.
 *
 * Implementation note: the `key={viewKey}` on the inner motion.div forces React
 * to remount the node on each view switch, which retriggers the Framer Motion
 * entrance animation. We deliberately avoid `AnimatePresence` here because the
 * children include a `React.Suspense` boundary — keeping the wrapper simple
 * avoids any exit-animation timing conflicts with Suspense fallbacks.
 */
export function ViewTransition({
  viewKey,
  children,
}: {
  viewKey: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      key={viewKey}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="min-w-0"
    >
      {children}
    </motion.div>
  );
}
