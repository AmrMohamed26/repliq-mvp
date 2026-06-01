"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Download, Loader2 } from "lucide-react";
import {
  analyzeEmailHtml,
  buildClipboardStagePayload,
  buildDebugReportText,
  probeImageUrl,
  scoreGmailCompatibility,
  type HtmlValidation,
} from "@/lib/email-clipboard-debug";
import {
  copyRichEmailHtml,
  type CopyEmailResult,
} from "@/lib/copy-email-clipboard";

export interface EmailDiagnosticsMeta {
  leadId: string;
  thumbnailUrl: string | null;
  shortUrl: string | null;
  videoUrl: string | null;
  storedThumbnailUrl: string | null;
}

interface EmailDiagnosticsPanelProps {
  leadId: string;
  emailHtml: string;
  meta: EmailDiagnosticsMeta | null;
  metaError: boolean;
}

function BoolBadge({ value }: { value: boolean }) {
  return (
    <span
      className={
        value
          ? "rounded px-1.5 py-0.5 text-xs font-mono text-emerald-400 bg-emerald-400/10"
          : "rounded px-1.5 py-0.5 text-xs font-mono text-[#a3a3a3] bg-white/5"
      }
    >
      {value ? "true" : "false"}
    </span>
  );
}

export function EmailDiagnosticsPanel({
  leadId,
  emailHtml,
  meta,
  metaError,
}: EmailDiagnosticsPanelProps) {
  const stages = useMemo(
    () => buildClipboardStagePayload(emailHtml),
    [emailHtml],
  );

  const [validation, setValidation] = useState<HtmlValidation | null>(null);
  const [copyTestMode, setCopyTestMode] = useState<CopyEmailResult | null>(null);
  const [copyTestError, setCopyTestError] = useState<string | null>(null);
  const [copyTesting, setCopyTesting] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);
  const [reportCopying, setReportCopying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const base = analyzeEmailHtml(emailHtml);
    setValidation({
      ...base,
      imageUrlStatus: null,
      imageUrlStatusError: null,
    });

    if (!base.imageUrl) return;

    probeImageUrl(base.imageUrl).then(({ status, error }) => {
      if (cancelled) return;
      setValidation((v) =>
        v
          ? { ...v, imageUrlStatus: status, imageUrlStatusError: error }
          : null,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [emailHtml]);

  const fragmentEmbeddedInWrapper = stages.clipboardWrapperHtml.includes(
    `<!--StartFragment-->${stages.fragmentBeforeWrap}<!--EndFragment-->`,
  );

  const apiEqualsFragmentTrimmed =
    stages.apiEmailHtml === stages.fragmentBeforeWrap;

  const gmailCompat = useMemo(
    () => scoreGmailCompatibility(stages.fragmentBeforeWrap),
    [stages.fragmentBeforeWrap],
  );

  const runCopyTest = useCallback(async () => {
    setCopyTesting(true);
    setCopyTestError(null);
    setCopyTestMode(null);
    try {
      const mode = await copyRichEmailHtml(emailHtml);
      setCopyTestMode(mode);
    } catch (err) {
      setCopyTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setCopyTesting(false);
    }
  }, [emailHtml]);

  const exportGmailTestPackage = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setCopyTestError(null);
    try {
      const metaJson = JSON.stringify(
        {
          leadId,
          thumbnailUrl: meta?.thumbnailUrl ?? null,
          shortUrl: meta?.shortUrl ?? null,
          videoUrl: meta?.videoUrl ?? null,
        },
        null,
        2,
      );

      const safeLead = leadId.replace(/[^a-zA-Z0-9_-]/g, "_");

      downloadTextFile(
        `gmail-test-${safeLead}-email.html`,
        stages.fragmentBeforeWrap,
        "text/html",
      );
      downloadTextFile(
        `gmail-test-${safeLead}-email-full.html`,
        stages.clipboardWriteHtml,
        "text/html",
      );
      downloadTextFile(
        `gmail-test-${safeLead}-metadata.json`,
        metaJson,
        "application/json",
      );

      setExported(true);
      setTimeout(() => setExported(false), 2800);
    } catch (err) {
      setCopyTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }, [exporting, leadId, meta, stages]);

  const copyDebugReport = useCallback(async () => {
    if (!validation) return;
    setReportCopying(true);
    try {
      const text = buildDebugReportText({
        leadId,
        thumbnailUrl: meta?.thumbnailUrl ?? null,
        shortUrl: meta?.shortUrl ?? null,
        videoUrl: meta?.videoUrl ?? null,
        storedThumbnailUrl: meta?.storedThumbnailUrl ?? null,
        stages,
        validation,
        copyTestMode,
        copyTestError,
        apiEqualsFragmentTrimmed,
        fragmentEmbeddedInWrapper,
      });
      await navigator.clipboard.writeText(text);
      setReportCopied(true);
      setTimeout(() => setReportCopied(false), 2800);
    } catch (err) {
      setCopyTestError(
        err instanceof Error ? err.message : "Could not copy report",
      );
    } finally {
      setReportCopying(false);
    }
  }, [
    validation,
    leadId,
    meta,
    stages,
    exporting,
    copyTestMode,
    copyTestError,
    apiEqualsFragmentTrimmed,
    fragmentEmbeddedInWrapper,
  ]);

  const thumbSrc = validation?.imageUrl ?? meta?.thumbnailUrl ?? null;

  return (
    <section className="mt-10 w-full max-w-3xl border-t border-white/10 pt-10 text-left">
      <h2 className="m-0 text-lg font-semibold tracking-tight text-[#fafafa]">
        Email Diagnostics
      </h2>
      <p className="mt-2 m-0 text-xs text-[#737373]">
        Temporary — compares API HTML vs clipboard stages. Does not change Copy
        Email behavior.
      </p>

      {metaError && (
        <p className="mt-3 text-sm text-amber-400">
          Could not load /api/email/{leadId}/diagnostics metadata.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportGmailTestPackage}
          disabled={exporting || !meta}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-[#fafafa] hover:bg-white/10 disabled:opacity-50"
          title={!meta ? "Waiting for metadata…" : "Download test package files"}
        >
          {exported ? (
            <>
              <Check className="size-4 text-emerald-400" />
              Exported
            </>
          ) : (
            <>
              <Download className="size-4" />
              {exporting ? "Exporting…" : "Export Gmail Test Package"}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={copyDebugReport}
          disabled={reportCopying || !validation}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-[#fafafa] hover:bg-white/10 disabled:opacity-50"
        >
          {reportCopied ? (
            <>
              <Check className="size-4 text-emerald-400" />
              Report copied
            </>
          ) : (
            <>
              <ClipboardList className="size-4" />
              {reportCopying ? "Copying…" : "Copy Debug Report"}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={runCopyTest}
          disabled={copyTesting}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-[#fafafa] hover:bg-white/10 disabled:opacity-50"
        >
          {copyTesting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Running copy test…
            </>
          ) : (
            "Run copy-to-clipboard test"
          )}
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-[#111] p-3">
        <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-[#737373]">
          Gmail compatibility
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 text-sm text-[#d4d4d4]">
            score:{" "}
            <span className="font-mono text-emerald-400">{gmailCompat.score}</span>
            <span className="text-[#737373]">/100</span>
          </p>
          <p className="m-0 text-sm text-[#d4d4d4]">
            img count:{" "}
            <span className="font-mono text-[#fafafa]">{gmailCompat.imgCount}</span>
          </p>
        </div>
        {gmailCompat.images.length > 0 && (
          <div className="mt-3 space-y-2">
            {gmailCompat.images.map((img) => (
              <div key={img.index} className="rounded border border-white/10 bg-black/20 p-2">
                <p className="m-0 text-xs font-mono text-[#a3a3a3]">
                  img[{img.index}] kind={img.kind} width={img.widthAttr ?? "?"} height=
                  {img.heightAttr ?? "?"}
                </p>
                <p className="mt-1 m-0 break-all text-xs font-mono text-[#d4d4d4]">
                  {img.src || "(missing src)"}
                </p>
                {(img.host || img.protocol) && (
                  <p className="mt-1 m-0 text-xs font-mono text-[#737373]">
                    {img.protocol ?? ""} {img.host ?? ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        <ul className="mt-3 m-0 list-disc space-y-1 pl-5 text-xs text-[#a3a3a3]">
          {gmailCompat.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <div className="mt-3 rounded border border-white/10 bg-black/20 p-2 text-xs text-[#a3a3a3]">
          <p className="m-0 font-semibold text-[#d4d4d4]">Compare with Gmail “Show original”</p>
          <p className="mt-1 m-0">
            After sending a test email, open it in Gmail → ⋮ → Show original. Search the HTML
            part for the exact <span className="font-mono">leadId</span> and the exported{" "}
            <span className="font-mono">img src</span>. Gmail may rewrite <span className="font-mono">src</span>{" "}
            to a <span className="font-mono">googleusercontent.com</span> proxy, but the original URL is often
            preserved elsewhere in the HTML.
          </p>
        </div>
      </div>

      {meta && (
        <dl className="mt-4 grid gap-1 text-xs font-mono text-[#a3a3a3]">
          <div>
            <dt className="inline text-[#737373]">leadId: </dt>
            <dd className="inline text-[#d4d4d4]">{meta.leadId}</dd>
          </div>
          <div>
            <dt className="inline text-[#737373]">thumbnailUrl: </dt>
            <dd className="inline break-all text-[#d4d4d4]">
              {meta.thumbnailUrl ?? "(none)"}
            </dd>
          </div>
          <div>
            <dt className="inline text-[#737373]">shortUrl: </dt>
            <dd className="inline break-all text-[#d4d4d4]">
              {meta.shortUrl ?? "(none)"}
            </dd>
          </div>
          <div>
            <dt className="inline text-[#737373]">videoUrl: </dt>
            <dd className="inline break-all text-[#d4d4d4]">
              {meta.videoUrl ?? "(none)"}
            </dd>
          </div>
        </dl>
      )}

      {validation && (
        <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-[#111] p-3">
          <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-[#737373]">
            Validation
          </p>
          <ul className="m-0 list-none space-y-1.5 text-sm text-[#d4d4d4]">
            <li className="flex flex-wrap items-center gap-2">
              contains &lt;img&gt;? <BoolBadge value={validation.containsImg} />
            </li>
            <li className="flex flex-wrap items-center gap-2">
              contains background-image?{" "}
              <BoolBadge value={validation.containsBackgroundImage} />
            </li>
            <li className="break-all">
              image URL host: {validation.imageUrlHost ?? "(none)"}
            </li>
            <li>
              image URL protocol: {validation.imageUrlProtocol ?? "(none)"}
            </li>
            <li>
              image URL response status:{" "}
              {validation.imageUrlStatus ?? "(probing…)"}
              {validation.imageUrlStatusError
                ? ` — ${validation.imageUrlStatusError}`
                : ""}
            </li>
          </ul>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-[#111] p-3">
        <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-[#737373]">
          Clipboard chain
        </p>
        <ul className="m-0 list-none space-y-1 text-sm text-[#d4d4d4]">
          <li>
            API HTML === fragment (trim only):{" "}
            <BoolBadge value={apiEqualsFragmentTrimmed} />
          </li>
          <li>
            Fragment inside wrapper (StartFragment):{" "}
            <BoolBadge value={fragmentEmbeddedInWrapper} />
          </li>
          <li className="text-xs text-[#737373]">
            Clipboard write uses wrapper HTML, not raw API body.
          </li>
        </ul>
      </div>

      {(copyTestMode || copyTestError) && (
        <div className="mt-4 rounded-lg border border-white/10 bg-[#111] p-3 text-sm">
          <p className="m-0 mb-1 text-xs font-semibold uppercase tracking-wide text-[#737373]">
            Copy-to-clipboard test
          </p>
          {copyTestMode && (
            <p className="m-0 text-[#d4d4d4]">
              copyRichEmailHtml mode:{" "}
              <span className="font-mono text-emerald-400">{copyTestMode}</span>
            </p>
          )}
          {copyTestError && (
            <p className="m-0 text-red-400">{copyTestError}</p>
          )}
        </div>
      )}

      <DiagnosticBlock
        title="1. Thumbnail (email img URL)"
        className="mt-6"
      >
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbSrc}
            alt="Diagnostic thumbnail"
            className="mx-auto block max-w-full rounded-lg border border-white/10"
            style={{ maxWidth: 360 }}
          />
        ) : (
          <p className="m-0 text-sm text-[#737373]">No image URL in HTML.</p>
        )}
        {thumbSrc && (
          <p className="mt-2 m-0 break-all text-xs font-mono text-[#737373]">
            {thumbSrc}
          </p>
        )}
      </DiagnosticBlock>

      <DiagnosticBlock title="2. Raw HTML (API response)" className="mt-4">
        <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-[#a3a3a3]">
          {stages.apiEmailHtml}
        </pre>
      </DiagnosticBlock>

      <DiagnosticBlock title="3. Parsed HTML preview" className="mt-4">
        <div
          className="email-preview-root overflow-auto rounded border border-white/5 bg-[#0a0a0a] p-3"
          dangerouslySetInnerHTML={{ __html: stages.fragmentBeforeWrap }}
        />
      </DiagnosticBlock>

      <DiagnosticBlock
        title="4. Fragment before wrap (clipboard input)"
        className="mt-4"
      >
        <pre className="m-0 max-h-36 overflow-auto whitespace-pre-wrap break-all text-xs text-[#a3a3a3]">
          {stages.fragmentBeforeWrap}
        </pre>
      </DiagnosticBlock>

      <DiagnosticBlock
        title="5. Wrapper HTML (text/html Blob for clipboard.write)"
        className="mt-4"
      >
        <pre className="m-0 max-h-36 overflow-auto whitespace-pre-wrap break-all text-xs text-[#a3a3a3]">
          {stages.clipboardWriteHtml}
        </pre>
      </DiagnosticBlock>
    </section>
  );
}

function DiagnosticBlock({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <p className="m-0 mb-2 text-xs font-semibold text-[#a3a3a3]">{title}</p>
      <div className="rounded-lg border border-white/10 bg-[#111] p-3">
        {children}
      </div>
    </div>
  );
}

function downloadTextFile(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
