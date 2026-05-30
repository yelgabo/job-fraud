import type { Metadata } from "next"
import Link from "next/link"
import "./globals.css"

export const metadata: Metadata = {
  title: "Job Fraud Scanner — WorkBC",
  description: "Fraud-risk scoring for WorkBC software job postings.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-baseline gap-x-4 px-4 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight text-zinc-900">
              🛡️ Job Fraud Scanner
            </Link>
            <nav className="flex gap-3 text-sm">
              <Link href="/" className="text-zinc-500 hover:text-zinc-900 hover:underline">
                Postings
              </Link>
              <Link href="/companies" className="text-zinc-500 hover:text-zinc-900 hover:underline">
                Companies
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-zinc-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-3 text-xs text-zinc-400">
            Geocoding © OpenStreetMap contributors. Source data: WorkBC. Risk scores are heuristic
            and for screening only.
          </div>
        </footer>
      </body>
    </html>
  )
}
