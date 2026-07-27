"use client";

import * as React from "react";
import { useApp } from "../store";
import { PageHeader, EmptyState } from "../parts/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  HelpCircle,
  Search,
  Sparkles,
  ArrowRight,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  FileText,
  LifeBuoy,
  X,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";

// ---------- Types (mirror API/help/route.ts) ----------
interface HelpArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  helpful: number;
  unhelpful: number;
}

interface HelpCategory {
  id: string;
  label: string;
  description: string;
}

interface HelpData {
  categories: HelpCategory[];
  articles: HelpArticle[];
}

// Category → icon mapping for the popular grid
const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  "getting-started": Sparkles,
  "wallet-funding": BookOpen,
  transfers: ArrowRight,
  "bills-payments": FileText,
  cards: HelpCircle,
  security: CheckCircle2,
  account: LifeBuoy,
  troubleshooting: HelpCircle,
};

// Tone (emerald/amber/slate) per category for visual variety
const CATEGORY_TONE: Record<string, string> = {
  "getting-started": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "wallet-funding": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  transfers: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "bills-payments": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  cards: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  security: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  account: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  troubleshooting: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export default function HelpCenterView() {
  const { setView } = useApp();
  const [data, setData] = React.useState<HelpData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null);
  const [openArticleId, setOpenArticleId] = React.useState<string | null>(null);
  // Local vote tracking — applied optimistically on top of static counts
  const [votes, setVotes] = React.useState<Record<string, "up" | "down" | undefined>>({});

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/help", { cache: "no-store" });
      if (res.status === 401) {
        toast.error("Session expired. Please log in again.");
        return;
      }
      if (!res.ok) {
        toast.error("Failed to load help center.");
        return;
      }
      setData(await res.json());
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Filtered articles — by search AND optional category
  const filteredArticles = React.useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    let list = data.articles;
    if (activeCategory) list = list.filter((a) => a.category === activeCategory);
    if (q) {
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.content.toLowerCase().includes(q) ||
          (data.categories.find((c) => c.id === a.category)?.label ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, search, activeCategory]);

  // Group filtered articles by category for the search results
  const groupedResults = React.useMemo(() => {
    if (!data) return [] as { category: HelpCategory; articles: HelpArticle[] }[];
    const groups = new Map<string, HelpArticle[]>();
    for (const a of filteredArticles) {
      const arr = groups.get(a.category) ?? [];
      arr.push(a);
      groups.set(a.category, arr);
    }
    return data.categories
      .filter((c) => groups.has(c.id))
      .map((c) => ({ category: c, articles: groups.get(c.id)! }));
  }, [data, filteredArticles]);

  const isSearching = search.trim().length > 0;

  function vote(article: HelpArticle, kind: "up" | "down") {
    setVotes((prev) => ({ ...prev, [article.id]: kind }));
    toast.success(
      kind === "up" ? "Thanks for your feedback!" : "We'll work on improving this article.",
      {
        description:
          kind === "up"
            ? "Glad this was helpful."
            : "Try reaching our team for more specific help.",
      }
    );
  }

  function openArticle(article: HelpArticle) {
    setOpenArticleId(article.id);
  }

  const activeArticle = React.useMemo(
    () => data?.articles.find((a) => a.id === openArticleId) ?? null,
    [data, openArticleId]
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Help Center" subtitle="Search articles and find answers fast" />
        <Skeleton className="h-14 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-5">
        <PageHeader title="Help Center" subtitle="Search articles and find answers fast" />
        <EmptyState
          illustration="no-data"
          title="Couldn't load articles"
          description="Please check your connection and try again."
          action={
            <Button onClick={load} variant="outline">
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Help Center" subtitle="Search articles and find answers fast" />

      {/* Hero search */}
      <div className="tp-emerald-grad relative overflow-hidden rounded-3xl p-6 text-white sm:p-8">
        <div className="tp-grain pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative mx-auto max-w-2xl text-center">
          <div className="mb-3 flex justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
              <HelpCircle className="h-6 w-6" />
            </span>
          </div>
          <h2 className="text-xl font-bold sm:text-2xl">How can we help you today?</h2>
          <p className="mt-1 text-sm text-white/80">
            Browse 24+ articles across 8 categories, or search for a specific topic.
          </p>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-white/70" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for help..."
              aria-label="Search help articles"
              className="text-foreground placeholder:text-muted-foreground h-14 w-full rounded-2xl border-0 bg-white/95 pr-12 pl-12 text-base shadow-lg outline-none focus:bg-white focus:ring-4 focus:ring-white/30"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground absolute top-1/2 right-3 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Searching mode — grouped results */}
      {isSearching ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">
              {filteredArticles.length} result{filteredArticles.length === 1 ? "" : "s"} for{" "}
              <span className="text-foreground font-medium">&ldquo;{search.trim()}&rdquo;</span>
            </p>
            <Button variant="ghost" size="sm" onClick={() => setSearch("")} className="gap-1.5">
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>

          {filteredArticles.length === 0 ? (
            <EmptyState
              illustration="no-data"
              title="No articles found"
              description="Try a different search term, or contact our support team."
              action={
                <Button onClick={() => setView("support")} variant="outline" className="gap-1.5">
                  <LifeBuoy className="h-4 w-4" /> Contact support
                </Button>
              }
            />
          ) : (
            groupedResults.map(({ category, articles }) => {
              const Icon = CATEGORY_ICON[category.id] ?? HelpCircle;
              return (
                <div key={category.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className="text-primary h-4 w-4" />
                    <h3 className="text-sm font-semibold">{category.label}</h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {articles.length}
                    </Badge>
                  </div>
                  <Card className="divide-y overflow-hidden p-0">
                    {articles.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => openArticle(a)}
                        className="hover:bg-muted/40 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
                      >
                        <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                        <p className="flex-1 truncate text-sm font-medium">{a.title}</p>
                        <ArrowRight className="text-muted-foreground h-4 w-4 shrink-0" />
                      </button>
                    ))}
                  </Card>
                </div>
              );
            })
          )}
        </div>
      ) : activeCategory ? (
        /* Category browse mode */
        <div className="space-y-5">
          {(() => {
            const cat = data.categories.find((c) => c.id === activeCategory);
            if (!cat) return null;
            const Icon = CATEGORY_ICON[cat.id] ?? HelpCircle;
            const arts = data.articles.filter((a) => a.category === cat.id);
            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${CATEGORY_TONE[cat.id] ?? ""}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold">{cat.label}</h3>
                      <p className="text-muted-foreground text-xs">{cat.description}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveCategory(null)}
                    className="gap-1.5"
                  >
                    <X className="h-3.5 w-3.5" /> Back to all categories
                  </Button>
                </div>
                <Card className="overflow-hidden p-0">
                  <Accordion type="single" collapsible className="w-full">
                    {arts.map((a) => (
                      <AccordionItem key={a.id} value={a.id} className="border-b last:border-b-0">
                        <AccordionTrigger className="hover:bg-muted/30 px-5 py-4 text-left text-sm font-medium hover:no-underline">
                          {a.title}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground px-5 pt-0 pb-4 text-sm">
                          <ArticleBody article={a} onVote={vote} vote={votes[a.id]} />
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </Card>
              </>
            );
          })()}
        </div>
      ) : (
        /* Default browse — categories grid + popular articles */
        <div className="space-y-6">
          <div>
            <h3 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wider uppercase">
              Popular categories
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {data.categories.map((cat) => {
                const Icon = CATEGORY_ICON[cat.id] ?? HelpCircle;
                const count = data.articles.filter((a) => a.category === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className="tp-card-hover tp-card-gradient group bg-card flex flex-col gap-3 rounded-2xl border p-5 text-left"
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${CATEGORY_TONE[cat.id] ?? ""}`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{cat.label}</p>
                      <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                        {cat.description}
                      </p>
                    </div>
                    <div className="text-muted-foreground mt-auto flex items-center gap-1.5 text-xs">
                      <FileText className="h-3.5 w-3.5" />
                      <span>
                        {count} article{count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Popular articles */}
          <div>
            <h3 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wider uppercase">
              Popular articles
            </h3>
            <Card className="overflow-hidden p-0">
              {data.articles
                .slice()
                .sort((a, b) => b.helpful - a.helpful)
                .slice(0, 6)
                .map((a, i) => (
                  <button
                    key={a.id}
                    onClick={() => openArticle(a)}
                    className={`hover:bg-muted/40 flex w-full items-center gap-3 px-5 py-3 text-left transition-colors ${
                      i > 0 ? "border-t" : ""
                    }`}
                  >
                    <span className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.title}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {data.categories.find((c) => c.id === a.category)?.label}
                      </p>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-1 text-xs">
                      <ThumbsUp className="h-3 w-3" /> {a.helpful}
                    </div>
                    <ArrowRight className="text-muted-foreground h-4 w-4 shrink-0" />
                  </button>
                ))}
            </Card>
          </div>
        </div>
      )}

      {/* Contact support CTA */}
      <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-amber-500/10 to-emerald-500/10 p-5 sm:p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <LifeBuoy className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold">Still need help?</p>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Our support team is available 24/7. Reach out and we&apos;ll respond within 24
                hours.
              </p>
            </div>
          </div>
          <Button onClick={() => setView("support")} className="gap-1.5">
            Contact support <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Article detail dialog */}
      <Dialog open={!!activeArticle} onOpenChange={(o) => !o && setOpenArticleId(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {activeArticle && (
            <>
              <DialogHeader>
                <Badge variant="secondary" className="mb-1.5 w-fit text-[10px]">
                  {data.categories.find((c) => c.id === activeArticle.category)?.label ??
                    activeArticle.category}
                </Badge>
                <DialogTitle className="text-lg leading-snug">{activeArticle.title}</DialogTitle>
                <DialogDescription className="sr-only">
                  Article content and feedback prompt.
                </DialogDescription>
              </DialogHeader>

              <ArticleBody
                article={activeArticle}
                onVote={vote}
                vote={votes[activeArticle.id]}
                expanded
              />

              <div className="mt-6 flex items-center justify-between border-t pt-4">
                <Button variant="ghost" size="sm" onClick={() => setOpenArticleId(null)}>
                  Close
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setView("support")}
                  className="gap-1.5"
                >
                  <LifeBuoy className="h-4 w-4" /> Still need help?
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Article body + vote prompt ----------

function ArticleBody({
  article,
  onVote,
  vote,
  expanded = false,
}: {
  article: HelpArticle;
  onVote: (a: HelpArticle, kind: "up" | "down") => void;
  vote?: "up" | "down";
  expanded?: boolean;
}) {
  // Helpful / unhelpful counts — apply optimistic delta if user has voted
  const helpfulCount = article.helpful + (vote === "up" ? 1 : 0);
  const unhelpfulCount = article.unhelpful + (vote === "down" ? 1 : 0);

  return (
    <div className={expanded ? "space-y-4" : "space-y-3"}>
      <div
        className={expanded ? "text-foreground text-sm leading-relaxed" : "text-sm leading-relaxed"}
      >
        {article.content.split("\n").map((line, i) =>
          line.trim() === "" ? (
            <div key={i} className="h-2" aria-hidden />
          ) : (
            <p key={i} className="whitespace-pre-wrap">
              {line}
            </p>
          )
        )}
      </div>

      {/* Vote prompt */}
      <div className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-xl p-3">
        <p className="text-muted-foreground text-xs font-medium">Was this helpful?</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onVote(article, "up")}
            aria-label="Mark as helpful"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              vote === "up"
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-background hover:bg-muted"
            }`}
          >
            <ThumbsUp className="h-3.5 w-3.5" /> Yes
            <span className="tabular-nums opacity-70">{helpfulCount}</span>
          </button>
          <button
            onClick={() => onVote(article, "down")}
            aria-label="Mark as not helpful"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              vote === "down"
                ? "border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400"
                : "bg-background hover:bg-muted"
            }`}
          >
            <ThumbsDown className="h-3.5 w-3.5" /> No
            <span className="tabular-nums opacity-70">{unhelpfulCount}</span>
          </button>
        </div>
        {vote && (
          <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Thanks for voting
          </span>
        )}
      </div>
    </div>
  );
}
