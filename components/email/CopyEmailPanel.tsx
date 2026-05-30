"use client";

import { useEffect, useState } from "react";
import { Check, Mail } from "lucide-react";
import { firstNameFromName } from "@/lib/personalized-message";
import {
  copyRichEmailHtml,
  type CopyEmailResult,
} from "@/lib/copy-email-clipboard";

interface CopyEmailPanelProps {
  leadId: string;
  name: string;
}

export function CopyEmailPanel({ leadId, name }: CopyEmailPanelProps) {
  const [emailHtml, setEmailHtml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastMode, setLastMode] = useState<CopyEmailResult | null>(null);

  const firstName = firstNameFromName(name);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/email/${leadId}`)
      .then((res) => {
        if (!res.ok) throw new Error("load failed");
        return res.text();
      })
      .then((html) => {
        if (!cancelled) setEmailHtml(html);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  async function handleCopy() {
    if (copying || !emailHtml) return;
    setCopying(true);
    try {
      const mode = await copyRichEmailHtml(emailHtml);
      setLastMode(mode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2800);
    } catch {
      setLastMode(null);
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-6 py-16 text-center text-[#fafafa]">
      <div className="flex w-full max-w-lg flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <p className="m-0 text-sm text-[#737373]">Outreach email for</p>
          <h1 className="m-0 text-3xl font-semibold tracking-tight">
            {firstName}
          </h1>
        </div>

        <p className="m-0 max-w-sm text-sm leading-relaxed text-[#a3a3a3]">
          Preview below matches what Gmail will receive. Click Copy Email, then
          paste into compose (Cmd+V).
        </p>

        {loadError && (
          <p className="m-0 text-sm text-red-400">Could not load email preview.</p>
        )}

        {emailHtml && (
          <div
            className="w-full overflow-hidden rounded-xl border border-white/10 bg-[#111] p-4 text-left"
            aria-label="Email preview"
          >
            <div
              className="email-preview-root mx-auto"
              dangerouslySetInnerHTML={{ __html: emailHtml }}
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleCopy}
          disabled={copying || !emailHtml}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-8 py-3.5 text-[15px] font-semibold text-[#0a0a0a] transition-colors hover:bg-[#e8e8e8] disabled:opacity-60"
        >
          {copied ? (
            <>
              <Check className="size-4 text-emerald-600" />
              Copied — paste in Gmail
            </>
          ) : (
            <>
              <Mail className="size-4" />
              {copying ? "Copying…" : "Copy Email"}
            </>
          )}
        </button>

        {copied && lastMode === "plain" && (
          <p className="m-0 text-xs text-amber-400/90">
            Copied as plain text only — use Chrome on desktop for the thumbnail.
          </p>
        )}
      </div>
    </div>
  );
}
