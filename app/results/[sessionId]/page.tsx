import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Sparkles, ArrowLeft } from "lucide-react";
import { getSession, getLeads, getAllResults } from "@/lib/session";
import { ProcessingDashboard } from "@/components/results/ProcessingDashboard";

type Props = { params: Promise<{ sessionId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sessionId } = await params;
  return { title: `Batch ${sessionId.slice(0, 8)}` };
}

/**
 * Server component: fetches initial state so the first paint is populated.
 * The ProcessingDashboard client component then subscribes to SSE for live updates.
 */
export default async function ResultsPage({ params }: Props) {
  const { sessionId } = await params;

  const [session, leads, results] = await Promise.all([
    getSession(sessionId),
    getLeads(sessionId),
    getAllResults(sessionId),
  ]);

  if (!session) notFound();

  // Merge pending leads into results so the grid shows all rows immediately
  const resultIds = new Set(results.map((r) => r.id));
  const pendingResults = leads
    .filter((l) => !resultIds.has(l.id))
    .map((l) => ({ ...l, status: "pending" as const }));
  const allResults = [...pendingResults, ...results];

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-6 py-10">
      {/* Navbar */}
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/new"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            New batch
          </Link>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="grid size-6 place-items-center rounded bg-foreground text-background">
              <Sparkles className="size-3.5" strokeWidth={2.4} />
            </div>
            <span className="text-sm font-medium">Repliq</span>
          </div>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {sessionId.slice(0, 12)}
        </span>
      </header>

      {/* Main dashboard */}
      <ProcessingDashboard
        sessionId={sessionId}
        initialResults={allResults}
        initialStage={session.stage}
        initialTotalLeads={leads.length}
      />
    </div>
  );
}
