/**
 * Rich clipboard for Gmail/Outlook: thumbnail renders on paste, not raw HTML source.
 */

export type CopyEmailResult = "rich" | "legacy" | "plain";

/** Fetch email HTML from API and copy as rich text/html (Gmail-ready). */
export async function fetchAndCopyEmailForLead(
  leadId: string,
): Promise<CopyEmailResult> {
  const res = await fetch(`/api/email/${leadId}`);
  if (!res.ok) {
    throw new Error("Could not load email HTML");
  }
  const html = await res.text();
  return copyRichEmailHtml(html);
}

function stripHtmlToPlain(html: string): string {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = doc.body.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Gmail/Word-friendly clipboard HTML wrapper. */
function wrapClipboardHtml(fragment: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><!--StartFragment-->${fragment}<!--EndFragment--></body></html>`;
}

async function copyViaClipboardApi(
  fragment: string,
  plain: string,
): Promise<boolean> {
  if (
    typeof ClipboardItem === "undefined" ||
    !navigator.clipboard?.write
  ) {
    return false;
  }

  const wrapped = wrapClipboardHtml(fragment);
  const htmlBlob = new Blob([wrapped], { type: "text/html" });
  const plainBlob = new Blob([plain], { type: "text/plain" });

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": plainBlob,
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Select rendered HTML in a hidden node — works well with Gmail compose. */
function copyViaExecCommand(html: string): boolean {
  if (typeof document === "undefined") return false;

  const host = document.createElement("div");
  host.contentEditable = "true";
  host.innerHTML = html;
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    opacity: "0",
  });
  document.body.appendChild(host);

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(host);

  let ok = false;
  try {
    selection?.removeAllRanges();
    selection?.addRange(range);
    ok = document.execCommand("copy");
  } finally {
    selection?.removeAllRanges();
    document.body.removeChild(host);
  }

  return ok;
}

export async function copyRichEmailHtml(html: string): Promise<CopyEmailResult> {
  const fragment = html.trim();
  if (!fragment) {
    throw new Error("Empty email HTML");
  }

  // #region agent log
  fetch("http://127.0.0.1:7489/ingest/874f54e3-af15-42bb-a33a-e094f9419f9f", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "b8d92c",
    },
    body: JSON.stringify({
      sessionId: "b8d92c",
      runId: "play-overlay-mockup",
      hypothesisId: "H4",
      location: "lib/copy-email-clipboard.ts:copyRichEmailHtml",
      message: "clipboard copy input markers",
      data: {
        fragmentLen: fragment.length,
        hasImg: /<img\s/i.test(fragment),
        imgCount: (fragment.match(/<img\s/gi) ?? []).length,
        hasPlayOverlay: /rgba\(0,0,0,0\.55\)/.test(fragment),
        hasAvatarImg: /\/api\/media\/avatar\//.test(fragment),
        hasBackgroundImage: /background-image:url\(/i.test(fragment),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const plain = stripHtmlToPlain(fragment) || "Watch your personalized video";

  if (await copyViaClipboardApi(fragment, plain)) {
    return "rich";
  }

  if (copyViaExecCommand(fragment)) {
    return "legacy";
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(plain);
    return "plain";
  }

  throw new Error("Clipboard API not available");
}
