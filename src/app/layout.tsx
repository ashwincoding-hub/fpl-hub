import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FPL Hub",
  description: "Free Fantasy Premier League planner: projections, transfers, price changes.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#38003c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="bg-brand text-brand-ink">
          <nav className="mx-auto flex max-w-6xl items-center gap-5 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              FPL <span className="text-accent">Hub</span>
            </Link>
            <Link href="/prices" className="text-sm opacity-90 hover:opacity-100">
              Price changes
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">{children}</main>
        <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-muted">
          Not affiliated with the Premier League or Fantasy Premier League. Data from the public FPL
          API. Projections are estimates, not advice.
        </footer>
      </body>
    </html>
  );
}
