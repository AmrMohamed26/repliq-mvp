/**
 * Compare ScrapingBee vs ZenRows on a list of URLs.
 *
 * Usage:
 *   npx tsx scripts/test-screenshot-providers.ts
 *   npx tsx scripts/test-screenshot-providers.ts --urls my-urls.txt
 *
 * Writes PNGs to /tmp/repliq-screenshot-test/ and prints a score table.
 */
import "dotenv/config";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  fetchScreenshotScrapingBee,
  fetchScreenshotZenRows,
} from "../workers/pipeline/screenshot-providers";

const DEFAULT_URLS = [
  "https://www.upwork.com/jobs/~022060184524811842526",
  "https://www.linkedin.com/company/google/",
  "https://stripe.com",
  "https://vercel.com",
];

type Provider = "scrapingbee" | "zenrows";

async function tryProvider(
  provider: Provider,
  url: string,
  outDir: string,
): Promise<{ ok: boolean; ms: number; bytes?: number; error?: string }> {
  const slug = url.replace(/[^a-z0-9]+/gi, "_").slice(0, 48);
  const outPath = path.join(outDir, `${provider}-${slug}.png`);
  const start = Date.now();
  try {
    if (provider === "scrapingbee") {
      await fetchScreenshotScrapingBee(url, outPath);
    } else {
      await fetchScreenshotZenRows(url, outPath);
    }
    const { size } = await stat(outPath);
    return { ok: true, ms: Date.now() - start, bytes: size };
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const outDir = path.join("/tmp", "repliq-screenshot-test");
  await mkdir(outDir, { recursive: true });

  const urlsArg = process.argv.indexOf("--urls");
  const urls =
    urlsArg >= 0
      ? (
          await import("node:fs/promises").then((fs) =>
            fs.readFile(process.argv[urlsArg + 1]!, "utf8"),
          )
        )
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
      : DEFAULT_URLS;

  const providers: Provider[] = [];
  if (process.env.SCRAPINGBEE_API_KEY) providers.push("scrapingbee");
  if (process.env.ZENROWS_API_KEY) providers.push("zenrows");

  if (providers.length === 0) {
    console.error("Set SCRAPINGBEE_API_KEY and/or ZENROWS_API_KEY in .env");
    process.exit(1);
  }

  const scores: Record<Provider, number> = {
    scrapingbee: 0,
    zenrows: 0,
  };

  console.log(`Testing ${urls.length} URL(s) → ${outDir}\n`);

  for (const url of urls) {
    console.log(`\n${url}`);
    for (const provider of providers) {
      const result = await tryProvider(provider, url, outDir);
      if (result.ok) {
        scores[provider]++;
        console.log(
          `  ✓ ${provider}  ${result.ms}ms  ${result.bytes} bytes`,
        );
      } else {
        console.log(`  ✗ ${provider}  ${result.error?.slice(0, 120)}`);
      }
    }
  }

  console.log("\n── Wins ──");
  for (const p of providers) {
    console.log(`  ${p}: ${scores[p]}/${urls.length}`);
  }
  const winner = [...providers].sort((a, b) => scores[b] - scores[a])[0];
  console.log(
    `\nSuggested SCREENSHOT_PROVIDER=${winner} (add to .env and restart worker)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
