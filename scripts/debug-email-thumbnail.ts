/**
 * Diagnose email thumbnail URL + HTML (does not touch pipeline).
 * Usage: npx tsx scripts/debug-email-thumbnail.ts <leadId>
 */
import "dotenv/config";
import { getVideoIndex } from "../lib/session.ts";
import { buildEmailBody } from "../lib/email.ts";
import { thumbnailUrlForEmail } from "../lib/media-url.ts";
import { watchPageUrl } from "../lib/app-url.ts";

const leadId = process.argv[2];
if (!leadId) {
  console.error("Usage: npx tsx scripts/debug-email-thumbnail.ts <leadId>");
  process.exit(1);
}

async function probe(url: string): Promise<void> {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    const ct = res.headers.get("content-type") ?? "";
    console.log(`  HTTP ${res.status} Content-Type: ${ct}`);
    if (!res.ok) {
      console.log(`  Body preview: ${(await res.text()).slice(0, 120)}`);
    }
  } catch (err) {
    console.log(`  fetch failed: ${err}`);
  }
}

const index = await getVideoIndex(leadId);
if (!index) {
  console.error("No video index for lead:", leadId);
  process.exit(1);
}

const stored = index.thumbnailUrl;
const emailUrl = thumbnailUrlForEmail(leadId, stored, process.env.NEXT_PUBLIC_APP_URL);
const watchUrl = watchPageUrl(leadId, process.env.NEXT_PUBLIC_APP_URL);
const html = buildEmailBody({
  name: index.name,
  watchUrl,
  thumbnailUrl: emailUrl,
});

console.log("--- Storage (VideoIndex) ---");
console.log("thumbnailUrl (stored):", stored ?? "(none)");
console.log("posterThumbnailUrl:", index.posterThumbnailUrl ?? "(none)");

console.log("\n--- Email HTML input ---");
console.log("thumbnailUrl (for email):", emailUrl ?? "(none)");

console.log("\n--- URL probes (incognito-equivalent) ---");
if (stored?.startsWith("https://")) {
  console.log("Stored Supabase:");
  await probe(stored);
}
if (emailUrl && emailUrl !== stored) {
  console.log("Email proxy URL:");
  await probe(emailUrl);
} else if (emailUrl) {
  console.log("Email URL (same as stored):");
  await probe(emailUrl);
}

console.log("\n--- Generated HTML markers ---");
const hasImg = /<img\s/i.test(html);
const hasBackground = /background-image:url\(/i.test(html);
const imgSrc = html.match(/<img[^>]+src="([^"]+)"/i)?.[1];
const bgUrl = html.match(/background-image:url\(([^)]+)\)/i)?.[1];

console.log("contains <img>:", hasImg);
console.log("contains background-image:", hasBackground);
console.log("img src in HTML:", imgSrc ?? "(none)");
console.log("background-image url in HTML:", bgUrl ?? "(none)");

console.log("\n--- Diagnosis ---");
if (!emailUrl) {
  console.log("FAIL: No thumbnail URL resolved for email.");
} else if (!hasImg && hasBackground) {
  console.log(
    "LIKELY ROOT CAUSE (#6): Email uses CSS background-image, not <img>. Gmail often blocks background-image → black box + play div only.",
  );
} else if (hasImg && imgSrc === emailUrl) {
  console.log("HTML uses <img> with correct src; if recipient still broken, check client image blocking or URL 4xx.");
}

process.exit(0);
