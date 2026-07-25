import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/turbopay/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Turbopay — The fast lane to your money",
  description:
    "Turbopay is the fast lane to your money. Fund your wallet, transfer, buy airtime & data, pay bills, get a virtual card, save and invest — all in one beautiful app.",
  keywords: [
    "Turbopay",
    "fintech",
    "Nigeria",
    "wallet",
    "transfer",
    "airtime",
    "bills",
    "virtual card",
    "savings",
  ],
  authors: [{ name: "Turbopay" }],
  icons: { icon: "/logo.svg" },
  openGraph: {
    title: "Turbopay — The fast lane to your money",
    description: "Fund, transfer, pay bills, save and invest — faster than ever.",
    siteName: "Turbopay",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
