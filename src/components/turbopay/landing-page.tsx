"use client";

import * as React from "react";
import { Logo, Wordmark } from "./logo";
import { AnimatedNumber } from "./parts/animated-number";
import {
  Zap,
  Wallet,
  Send,
  Smartphone,
  Receipt,
  ShieldCheck,
  CreditCard,
  PiggyBank,
  TrendingUp,
  Globe,
  ArrowRight,
  Check,
  Star,
  HelpCircle,
  Lock,
  BadgeCheck,
  Building2,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Quote,
  Trophy,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { naira } from "@/lib/money";

/* NFC wifi-wave icon (3 nested arcs) */
function NfcWave({ className = "" }: { className?: string }) {
  return (
    <span className={`tp-nfc-wave ${className}`} aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

/* VISA text logo placeholder */
function VisaLogo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`rounded-md bg-white/95 px-2 py-0.5 text-sm font-bold tracking-[0.18em] text-slate-900 italic shadow-sm ${className}`}
    >
      VISA
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* Testimonials carousel                                            */
/* ---------------------------------------------------------------- */
interface Testimonial {
  name: string;
  role: string;
  initials: string;
  rating: number;
  quote: string;
  tone: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    name: "Chidinma Eze",
    role: "Fashion retailer · Lagos",
    initials: "CE",
    rating: 5,
    quote:
      "Turbopay has completely changed how I run my boutique. Customer transfers hit instantly and the virtual card lets me pay my overseas suppliers without stress.",
    tone: "from-emerald-500 to-emerald-700",
  },
  {
    name: "Ibrahim Musa",
    role: "Software engineer · Abuja",
    initials: "IM",
    rating: 5,
    quote:
      "Best fintech app I've used in Nigeria. The UI is clean, transfers are instant, and I love the savings vaults — I've already earned more interest than my bank paid in 3 years.",
    tone: "from-amber-500 to-orange-600",
  },
  {
    name: "Adaeze Okafor",
    role: "Medical student · Ibadan",
    initials: "AO",
    rating: 5,
    quote:
      "As a student, paying bills and buying data used to be a hassle. With Turbopay everything is in one app — and the cashback on airtime is a real lifesaver.",
    tone: "from-sky-500 to-indigo-600",
  },
  {
    name: "Tunde Bakare",
    role: "Logistics owner · Kano",
    initials: "TB",
    rating: 5,
    quote:
      "I run a fleet of 12 delivery vans. Paying drivers, settling fuel bills, and tracking expenses used to take hours — Turbopay does it in minutes. The audit trail is gold.",
    tone: "from-rose-500 to-pink-600",
  },
  {
    name: "Funke Adebayo",
    role: "Freelance designer · Port Harcourt",
    initials: "FA",
    rating: 5,
    quote:
      "International clients pay me through Turbopay and I get alerts before they even close their email. The multi-currency wallet means I keep USD without losing to bad rates.",
    tone: "from-violet-500 to-purple-600",
  },
];

function TestimonialsCarousel() {
  const [active, setActive] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setActive((i) => (i + 1) % TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(t);
  }, [paused]);

  const go = (dir: 1 | -1) =>
    setActive((i) => (i + dir + TESTIMONIALS.length) % TESTIMONIALS.length);

  return (
    <div
      className="relative mx-auto max-w-3xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="bg-card relative overflow-hidden rounded-3xl border p-6 shadow-sm sm:p-10">
        <Quote className="text-primary/10 absolute top-6 right-6 h-10 w-10" />
        <div className="relative min-h-[200px] sm:min-h-[180px]">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={t.name}
              data-active={i === active}
              className="tp-testimonial"
              aria-hidden={i !== active}
            >
              <div className="flex items-center gap-1">
                {Array.from({ length: t.rating }).map((_, s) => (
                  <Star key={s} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-foreground mt-4 text-base leading-relaxed sm:text-lg">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="mt-5 flex items-center gap-3">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${t.tone} text-sm font-bold text-white shadow-sm`}
                >
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-muted-foreground text-xs">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          onClick={() => go(-1)}
          aria-label="Previous testimonial"
          className="bg-background hover:border-primary hover:bg-primary/5 flex h-9 w-9 items-center justify-center rounded-full border transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5">
          {TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Go to testimonial ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === active
                  ? "bg-primary w-6"
                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50 w-1.5"
              }`}
            />
          ))}
        </div>
        <button
          onClick={() => go(1)}
          aria-label="Next testimonial"
          className="bg-background hover:border-primary hover:bg-primary/5 flex h-9 w-9 items-center justify-center rounded-full border transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Trust badges row                                                 */
/* ---------------------------------------------------------------- */
const TRUST_BADGES = [
  { label: "PCI DSS Compliant", icon: ShieldCheck },
  { label: "NDPR Aware", icon: Lock },
  { label: "256-bit Encryption", icon: BadgeCheck },
  { label: "CBN Licensed Partner", icon: Building2 },
];

function TrustBadges() {
  return (
    <section className="bg-card/60 border-y py-7">
      <div className="mx-auto max-w-5xl px-4">
        <p className="text-muted-foreground mb-4 text-center text-xs font-medium tracking-widest uppercase">
          Trusted &amp; regulated
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TRUST_BADGES.map((b) => (
            <div
              key={b.label}
              className="border-border/60 bg-background/60 hover:border-primary/40 hover:bg-primary/5 flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-center transition-colors"
            >
              <b.icon className="text-primary h-4 w-4 shrink-0" />
              <span className="text-xs font-semibold sm:text-sm">{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Awards & recognition mini-section                                */
/* ---------------------------------------------------------------- */
const AWARDS = [
  { title: "Best Fintech Innovation", org: "Nigeria Tech Awards 2024", icon: Trophy },
  { title: "Top 10 Startups", org: "West Africa Innovators", icon: Award },
  { title: "Customer Excellence", org: "Fintech Magazine", icon: Sparkles },
];

/* ---------------------------------------------------------------- */
/* FAQ items with icons                                             */
/* ---------------------------------------------------------------- */
const FAQ_ITEMS: { q: string; a: string; icon: React.ComponentType<{ className?: string }> }[] = [
  {
    q: "Is Turbopay safe?",
    a: "Yes. We use bank-grade encryption, a double-entry ledger, transaction PINs, and full audit logging. Your funds are protected at every step.",
    icon: ShieldCheck,
  },
  {
    q: "How do I fund my wallet?",
    a: "You get a dedicated virtual account number on signup. Transfer money from any Nigerian bank and it reflects instantly. You can also fund via card or USSD.",
    icon: Wallet,
  },
  {
    q: "Are transfers really free?",
    a: "Transfers to other Turbopay users are completely free and instant. Bank transfers carry a small flat fee that's shown upfront before you confirm.",
    icon: Send,
  },
  {
    q: "What are the KYC limits?",
    a: "Tier 1 (Starter) allows ₦50K per transaction. Tier 2 (NIN) raises it to ₦500K. Tier 3 (BVN) unlocks ₦5M per transaction and unlimited balance.",
    icon: BadgeCheck,
  },
  {
    q: "Can I get a virtual card?",
    a: "Yes. You can issue a Visa virtual card instantly, fund it from your wallet, and use it for online payments worldwide. Freeze or terminate anytime.",
    icon: CreditCard,
  },
  {
    q: "How does savings work?",
    a: "Choose from flexible or locked savings plans earning up to 18% p.a. Interest accrues daily and you can withdraw anytime from flexible plans.",
    icon: PiggyBank,
  },
];

export function LandingPage({ onGetStarted }: { onGetStarted: () => void }) {
  // Hero balance — ₦49,400.00 in kobo
  const HERO_BALANCE_KOBO = 4_940_000;

  return (
    <div className="bg-background min-h-screen">
      {/* Navbar */}
      <header className="border-border/40 tp-glass sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Logo size={32} />
            <Wordmark size={20} />
          </div>
          <nav className="text-muted-foreground hidden items-center gap-7 text-sm font-medium md:flex">
            <a href="#providers" className="hover:text-foreground transition-colors">
              Providers
            </a>
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#how" className="hover:text-foreground transition-colors">
              How it works
            </a>
            <a href="#security" className="hover:text-foreground transition-colors">
              Security
            </a>
            <a href="#faq" className="hover:text-foreground transition-colors">
              FAQ
            </a>
          </nav>
          <Button onClick={onGetStarted} size="sm" className="gap-1.5">
            Get Started <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="tp-grain absolute inset-0 opacity-60" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div className="tp-fade-rise">
            <Badge className="border-primary/30 bg-primary/10 text-primary mb-5 gap-1.5 rounded-full">
              <Zap className="h-3.5 w-3.5" /> The fast lane to your money
            </Badge>
            <h1 className="text-4xl leading-[1.1] font-bold tracking-tight md:text-6xl">
              Your money,
              <br />
              <span className="text-primary">faster than ever.</span>
            </h1>
            <p className="text-muted-foreground mt-5 max-w-md text-base md:text-lg">
              Fund your wallet, transfer to any bank, buy airtime &amp; data, pay bills, get a
              virtual card, save and invest — all in one beautiful app built for Nigeria.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button onClick={onGetStarted} size="lg" className="gap-1.5">
                Create free account <ArrowRight className="h-4 w-4" />
              </Button>
              <Button onClick={onGetStarted} variant="outline" size="lg">
                Sign in
              </Button>
            </div>
            <div className="text-muted-foreground mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              <span className="flex items-center gap-1.5">
                <Check className="text-primary h-3.5 w-3.5" /> Instant transfers
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="text-primary h-3.5 w-3.5" /> Zero hidden fees
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="text-primary h-3.5 w-3.5" /> Bank-grade security
              </span>
            </div>
          </div>

          {/* Hero wallet card mockup — with 3D tilt, NFC, cardholder, VISA, animated balance */}
          <div className="relative hidden md:block">
            <div className="tp-wallet-card tp-card-tilt tp-holo tp-sheen relative aspect-[1.6/1] w-full max-w-md rounded-3xl p-6 text-white">
              {/* Top row: logo + NFC + VISA */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] tracking-widest uppercase opacity-70">Turbopay</p>
                  <p className="text-xs font-medium opacity-90">Virtual Card</p>
                </div>
                <div className="flex items-center gap-2">
                  <NfcWave className="opacity-80" />
                  <VisaLogo />
                </div>
              </div>

              {/* Chip */}
              <div className="relative mt-4 h-7 w-10 overflow-hidden rounded-md bg-gradient-to-br from-amber-200 via-amber-300 to-amber-500 shadow-inner">
                <div className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-amber-700/40" />
                <div className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-amber-700/40" />
                <div className="absolute top-1 left-1 h-1.5 w-2 rounded-sm border border-amber-700/40" />
                <div className="absolute right-1 bottom-1 h-1.5 w-2 rounded-sm border border-amber-700/40" />
              </div>

              {/* Balance */}
              <div className="mt-3">
                <p className="text-[10px]/none opacity-80">Available balance</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">
                  <AnimatedNumber value={HERO_BALANCE_KOBO} format={naira} duration={1600} />
                </p>
              </div>

              {/* Cardholder + account */}
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <p className="text-[10px] opacity-70">Cardholder</p>
                  <p className="text-sm font-semibold tracking-wider uppercase">ADAEZE OKAFOR</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] opacity-70">Virtual Account</p>
                  <p className="font-mono text-sm tracking-wider">8123 4567 89</p>
                </div>
              </div>

              {/* Quick chips */}
              <div className="mt-5 flex gap-2">
                {["Fund", "Transfer", "Airtime", "Bills"].map((p) => (
                  <span
                    key={p}
                    className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {/* floating stat cards */}
            <div className="bg-card absolute top-6 -left-6 rounded-2xl border p-3 shadow-xl">
              <div className="flex items-center gap-2">
                <div className="bg-primary/15 text-primary flex h-9 w-9 items-center justify-center rounded-xl">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px]">Instant transfer</p>
                  <p className="text-sm font-semibold">₦0 fee</p>
                </div>
              </div>
            </div>
            <div className="bg-card absolute -right-4 bottom-8 rounded-2xl border p-3 shadow-xl">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px]">Funding speed</p>
                  <p className="text-sm font-semibold">Instant</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-card/60 border-y py-6">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 px-4 md:grid-cols-4">
          {[
            { value: "16+", label: "Payment providers" },
            { value: "6", label: "Countries supported" },
            { value: "0%", label: "Hidden fees" },
            { value: "24/7", label: "Uptime & support" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-primary text-2xl font-bold md:text-3xl">{s.value}</p>
              <p className="text-muted-foreground text-xs">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust badges */}
      <TrustBadges />

      {/* Provider network */}
      <section id="providers" className="bg-background border-t py-14">
        <div className="mx-auto max-w-6xl px-4">
          <p className="text-muted-foreground mb-2 text-center text-sm font-medium">
            Powered by Nigeria&apos;s leading payment networks — synchronized, health-checked,
            always routed to the fastest &amp; cheapest path
          </p>
          <div className="mt-4 mb-7 flex flex-wrap items-center justify-center gap-3">
            <ProviderChip name="Remita" tag="RRR · Govt" featured />
            <ProviderChip name="Quickteller" tag="Interswitch" featured />
            <ProviderChip name="Paystack" tag="Cards · Transfer" />
            <ProviderChip name="Flutterwave" tag="Cards · Borderless" />
            <ProviderChip name="Monnify" tag="Virtual accounts" />
            <ProviderChip name="Baxi" tag="Bills · Airtime" />
            <ProviderChip name="M-Pesa" tag="Kenya MoMo" />
            <ProviderChip name="MTN MoMo" tag="UG · GH · RW" />
            <ProviderChip name="Airtel Money" tag="UG · TZ · KE" />
            <ProviderChip name="Smartcash" tag="Nigeria PSB" />
            <ProviderChip name="Wise" tag="International" />
            <ProviderChip name="Stripe" tag="Cards · Issuing" />
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
            <span className="flex items-center gap-1.5">
              <Check className="text-primary h-3.5 w-3.5" /> Auto-routed by success rate
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="text-primary h-3.5 w-3.5" /> Circuit-breaker protected
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="text-primary h-3.5 w-3.5" /> Lowest-fee first
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="text-primary h-3.5 w-3.5" /> 12+ providers, 1 unified API
            </span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-card/40 border-t py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <Badge variant="secondary" className="mb-3">
              Everything you need
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              One app for all your money
            </h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-xl">
              From everyday payments to long-term savings — Turbopay puts your finances in the fast
              lane.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Wallet,
                title: "Wallet & Virtual Account",
                desc: "Get a dedicated account number instantly. Fund via bank transfer, card, or USSD.",
              },
              {
                icon: Send,
                title: "Free Turbopay Transfers",
                desc: "Send money to other Turbopay users instantly and free. Bank transfers at low fees.",
              },
              {
                icon: Smartphone,
                title: "Airtime & Data",
                desc: "Top up any network in seconds. Buy affordable data bundles for MTN, Glo, Airtel, 9mobile.",
              },
              {
                icon: Receipt,
                title: "Bill Payments",
                desc: "Pay electricity, cable TV, internet, water, education, insurance and more.",
              },
              {
                icon: ShieldCheck,
                title: "Protected at Every Step",
                desc: "Transaction PIN, session monitoring, audit trails, and encrypted data keep you safe.",
              },
              {
                icon: CreditCard,
                title: "Virtual Cards",
                desc: "Get a Visa virtual card for online shopping worldwide. Freeze, fund, and control spending.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="group bg-card hover:border-primary/40 rounded-2xl border p-6 transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground mb-4 flex h-11 w-11 items-center justify-center rounded-xl transition-colors">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-12 text-center">
            <Badge variant="secondary" className="mb-3">
              Get started in minutes
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">How it works</h2>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                n: 1,
                title: "Create your account",
                desc: "Sign up with your email or phone in under 60 seconds. No paperwork.",
              },
              {
                n: 2,
                title: "Fund your wallet",
                desc: "Add money via bank transfer to your virtual account, card, or USSD.",
              },
              {
                n: 3,
                title: "Start transacting",
                desc: "Transfer, pay bills, buy airtime, save, invest — your money, your rules.",
              },
            ].map((s) => (
              <div key={s.n} className="relative text-center">
                <div className="tp-emerald-grad mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-lg">
                  {s.n}
                </div>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-card/40 border-t py-20">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-10 text-center">
            <Badge variant="secondary" className="mb-3 gap-1.5">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> Loved by Nigerians
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              What our customers say
            </h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-xl">
              Join thousands of Nigerians using Turbopay to move money faster, save smarter, and
              spend with confidence.
            </p>
          </div>
          <TestimonialsCarousel />
        </div>
      </section>

      {/* Awards & recognition */}
      <section className="py-16">
        <div className="mx-auto max-w-5xl px-4">
          <div className="mb-8 text-center">
            <Badge variant="secondary" className="mb-3 gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-amber-500" /> Recognised
            </Badge>
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              Awards &amp; recognition
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {AWARDS.map((a) => (
              <div
                key={a.title}
                className="bg-card relative overflow-hidden rounded-2xl border p-5 text-center"
              >
                <div className="tp-award-shine absolute inset-0 opacity-25" />
                <div className="relative">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 text-amber-600 dark:text-amber-400">
                    <a.icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">{a.org}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="bg-card/40 border-y py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 md:grid-cols-2">
          <div>
            <Badge className="mb-3 gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Bank-grade security
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Your money is always protected
            </h2>
            <p className="text-muted-foreground mt-4">
              We build security into everything. From encrypted data to transaction PINs and full
              audit trails, Turbopay keeps your funds safe around the clock.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Double-entry ledger with atomic balances",
                "Transaction PIN required for every debit",
                "Encrypted personal data (AES-256-GCM)",
                "Full audit log of every action",
                "3-tier KYC with progressive limits",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm">
                  <span className="bg-primary/15 text-primary flex h-5 w-5 items-center justify-center rounded-full">
                    <Check className="h-3 w-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: PiggyBank, label: "Savings", value: "Up to 18% p.a." },
              { icon: TrendingUp, label: "Investments", value: "From ₦25,000" },
              { icon: Globe, label: "Multi-currency", value: "USD · EUR · GBP" },
              { icon: CreditCard, label: "Virtual cards", value: "Instant issue" },
            ].map((s) => (
              <div key={s.label} className="bg-background rounded-2xl border p-5">
                <s.icon className="text-primary mb-3 h-6 w-6" />
                <p className="text-muted-foreground text-xs">{s.label}</p>
                <p className="text-lg font-semibold">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20">
        <div className="mx-auto max-w-3xl px-4">
          <div className="mb-10 text-center">
            <Badge variant="secondary" className="mb-3 gap-1.5">
              <HelpCircle className="h-3.5 w-3.5" /> FAQ
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Frequently asked questions
            </h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="tp-accordion-content">
                <AccordionTrigger className="tp-accordion-trigger text-left text-base font-medium hover:no-underline">
                  <span className="flex items-center gap-3">
                    <span className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                      <item.icon className="h-3.5 w-3.5" />
                    </span>
                    {item.q}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pl-10 text-sm">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-20">
        <div className="tp-wallet-card mx-auto max-w-5xl overflow-hidden rounded-3xl px-8 py-14 text-center text-white">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Ready to move money faster?
          </h2>
          <p className="mx-auto mt-3 max-w-md opacity-90">
            Join thousands of Nigerians using Turbopay to send, save, and spend smarter.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button onClick={onGetStarted} size="lg" variant="secondary" className="gap-1.5">
              Create free account <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              onClick={onGetStarted}
              size="lg"
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              Sign in
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card/40 border-t py-10">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <Logo size={28} />
              <Wordmark size={18} />
            </div>
            <p className="text-muted-foreground mt-3 text-xs">The fast lane to your money.</p>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold">Product</p>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li>Wallet</li>
              <li>Transfers</li>
              <li>Virtual Cards</li>
              <li>Savings</li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold">Company</p>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li>About</li>
              <li>Careers</li>
              <li>Blog</li>
              <li>Press</li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold">Support</p>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li>Help Center</li>
              <li>Contact</li>
              <li>Privacy</li>
              <li>Terms</li>
            </ul>
          </div>
        </div>
        <div className="text-muted-foreground mx-auto mt-8 flex max-w-6xl flex-col items-center justify-between gap-3 border-t px-4 pt-6 text-xs sm:flex-row">
          <p>© {new Date().getFullYear()} Turbopay. All rights reserved.</p>
          <span className="flex items-center gap-1.5">
            <span className="tp-pulse-dot h-2 w-2 rounded-full bg-emerald-500" />
            All systems operational
          </span>
        </div>
      </footer>
    </div>
  );
}

function ProviderChip({
  name,
  tag,
  featured = false,
}: {
  name: string;
  tag: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`group flex items-center gap-2.5 rounded-xl border px-4 py-2.5 transition-all hover:-translate-y-0.5 hover:shadow-md ${
        featured ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
          featured ? "tp-emerald-grad text-white" : "bg-muted text-muted-foreground"
        }`}
      >
        {name.slice(0, 2).toUpperCase()}
      </div>
      <div className="leading-tight">
        <p className={`text-sm font-semibold ${featured ? "text-foreground" : "text-foreground"}`}>
          {name}
        </p>
        <p className="text-muted-foreground text-[10px]">{tag}</p>
      </div>
      {featured && (
        <Badge variant="secondary" className="bg-primary/15 text-primary ml-1 text-[9px]">
          ★
        </Badge>
      )}
    </div>
  );
}
