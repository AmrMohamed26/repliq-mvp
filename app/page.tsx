import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-5xl flex-col px-6">
      <header className="flex items-center justify-between py-8">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-md bg-foreground text-background">
            <Sparkles className="size-4" strokeWidth={2.4} />
          </div>
          <span className="text-sm font-medium tracking-tight">Repliq</span>
        </div>
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <a
            href="https://github.com"
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            GitHub
          </a>
        </nav>
      </header>

      <section className="flex flex-1 flex-col items-start justify-center gap-8 py-16">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Local-first · no accounts · no SaaS
        </div>

        <h1 className="max-w-3xl text-balance text-5xl font-medium tracking-tight md:text-6xl">
          Personalized outreach videos
          <br />
          <span className="text-muted-foreground">
            for every lead in your CSV.
          </span>
        </h1>

        <p className="max-w-xl text-balance text-base text-muted-foreground md:text-lg">
          Upload a list and a talking head. Repliq screenshots each
          prospect&rsquo;s website, composes a Loom-style video, and hands you
          back a CSV of ready-to-send URLs.
        </p>

        <div className="flex items-center gap-3">
          <Link
            href="/new"
            className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-transform hover:scale-[1.02]"
          >
            Start a batch
            <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
          <a
            href="#how"
            className="rounded-full px-5 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
          >
            How it works
          </a>
        </div>
      </section>

      <section id="how" className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] md:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.title}
            className="flex flex-col gap-2 bg-background p-6"
          >
            <div className="font-mono text-xs text-muted-foreground">
              {step.index}
            </div>
            <div className="text-sm font-medium">{step.title}</div>
            <p className="text-sm text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-auto py-8 text-xs text-muted-foreground">
        Built with Next.js, Remotion, Playwright, BullMQ and Supabase Storage.
      </footer>
    </main>
  );
}

const STEPS = [
  {
    index: "01",
    title: "Upload your CSV",
    body: "Name, email, website columns. We preview the rows before anything runs.",
  },
  {
    index: "02",
    title: "Record once",
    body: "Drop a single talking-head MP4. We&rsquo;ll reuse it across every lead.",
  },
  {
    index: "03",
    title: "Get a CSV back",
    body: "Personalized video and thumbnail URLs for every prospect, hosted on R2.",
  },
] as const;
