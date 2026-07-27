"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X, Send, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useApp, type AppUser } from "./store";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "tp_ai_chat";

const SUGGESTED_PROMPTS = [
  "How do I fund my wallet?",
  "What are the KYC limits?",
  "How long do transfers take?",
  "Is my money safe?",
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-emerald-500/70"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.16,
          }}
        />
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-emerald-500 to-emerald-600 px-3.5 py-2 text-sm text-white shadow-sm"
            : "bg-card text-card-foreground max-w-[85%] rounded-2xl rounded-bl-md border px-3.5 py-2 text-sm shadow-sm"
        }
      >
        {!isUser && (
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
            <Sparkles className="h-3 w-3" /> Assistant
          </div>
        )}
        <p className="leading-relaxed break-words whitespace-pre-wrap">{msg.content}</p>
      </div>
    </motion.div>
  );
}

export default function AiSupport({ user: userProp }: { user?: AppUser | null }) {
  const appUser = useApp((s) => s.user);
  const user = userProp ?? appUser;

  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Load persisted conversation on mount
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) {
          setMessages(
            parsed.filter(
              (m) =>
                m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
            )
          );
        }
      }
    } catch {
      // ignore corrupted storage
    }
    setHydrated(true);
  }, []);

  // Persist conversation whenever it changes (after hydration)
  React.useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // storage may be full / unavailable
    }
  }, [messages, hydrated]);

  // Auto-scroll to bottom on new messages / typing
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  // Focus input when opening
  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!user) return null;

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = (await res.json()) as { content?: string };
      const reply = data.content?.trim() || "Sorry, I couldn't respond. Please try again later.";
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: "Sorry, I couldn't respond right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const showSuggestions = messages.length === 0 && !loading;

  return (
    <>
      {/* Floating button */}
      <motion.button
        type="button"
        aria-label={open ? "Close Turbopay assistant" : "Open Turbopay assistant"}
        onClick={() => setOpen((v) => !v)}
        className="fixed right-4 bottom-20 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 transition-transform hover:scale-105 active:scale-95 sm:right-6 sm:bottom-6"
        whileTap={{ scale: 0.92 }}
      >
        {!open && (
          <span className="absolute inset-0 rounded-full bg-emerald-400/50 motion-safe:animate-ping" />
        )}
        <AnimatePresence mode="wait" initial={false}>
          {open ? (
            <motion.span
              key="x"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="relative"
            >
              <X className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span
              key="sparkles"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="relative"
            >
              <Sparkles className="h-6 w-6" />
            </motion.span>
          )}
        </AnimatePresence>
        {!open && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400" />
            <span className="border-background relative inline-flex h-3.5 w-3.5 rounded-full border-2 bg-amber-500" />
          </span>
        )}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="border-border/60 bg-background/80 tp-glass fixed right-4 bottom-40 left-4 z-50 flex h-[60vh] max-h-[560px] flex-col overflow-hidden rounded-2xl border shadow-2xl sm:right-6 sm:bottom-24 sm:left-auto sm:h-[560px] sm:w-[400px]"
            role="dialog"
            aria-label="Turbopay assistant chat"
          >
            {/* Header */}
            <div className="border-border/60 flex items-center justify-between gap-2 border-b bg-gradient-to-r from-emerald-500/10 via-transparent to-amber-500/10 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm leading-tight font-semibold">Turbopay Assistant</p>
                  <p className="text-muted-foreground flex items-center gap-1 text-[11px]">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Online · AI-powered
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive h-8 w-8"
                  onClick={handleClear}
                  aria-label="Clear conversation"
                  title="Clear conversation"
                  disabled={messages.length === 0 && !loading}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setOpen(false)}
                  aria-label="Close chat"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Body */}
            <div
              ref={scrollRef}
              className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-4"
            >
              {showSuggestions ? (
                <div className="flex h-full flex-col items-center justify-center px-2 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30">
                    <Sparkles className="h-7 w-7" />
                  </div>
                  <p className="mt-4 text-sm font-semibold">
                    Hi{user?.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}! 👋
                  </p>
                  <p className="text-muted-foreground mt-1 max-w-[260px] text-xs">
                    I&apos;m your Turbopay assistant. Ask me anything about your wallet, transfers,
                    bills, savings and more.
                  </p>
                  <div className="mt-5 grid w-full gap-2">
                    {SUGGESTED_PROMPTS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => sendMessage(p)}
                        className="group border-border/60 bg-card/60 flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5"
                      >
                        <span>{p}</span>
                        <Sparkles className="text-muted-foreground h-3.5 w-3.5 shrink-0 transition-colors group-hover:text-emerald-500" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((m, i) => (
                    <MessageBubble key={i} msg={m} />
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-card max-w-[85%] rounded-2xl rounded-bl-md border px-3.5 py-2 shadow-sm">
                        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
                          <Sparkles className="h-3 w-3" /> Assistant
                        </div>
                        <TypingDots />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-border/60 bg-background/60 border-t px-3 py-3">
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message…"
                  disabled={loading}
                  className="bg-background h-10 flex-1 rounded-xl"
                  aria-label="Message"
                />
                <Button
                  type="button"
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm hover:from-emerald-600 hover:to-emerald-700"
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-muted-foreground mt-1.5 px-1 text-[10px]">
                AI-powered responses · Powered by Turbopay AI
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
