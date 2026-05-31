/**
 * Pre-compile Remotion at Docker build time so the first lead does not sit on
 * "Rendering" while webpack runs on a small Railway instance.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { bundle } from "@remotion/bundler";

const outDir =
  process.env.REMOTION_BUNDLE_PATH?.trim() ||
  path.join(process.cwd(), ".cache", "remotion-bundle");
const publicDir = path.join(process.cwd(), "tmp", "remotion-public");

async function main(): Promise<void> {
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(publicDir, { recursive: true });

  const entryPoint = path.resolve(process.cwd(), "remotion/index.ts");
  console.log("[bundle-remotion] entry:", entryPoint);
  console.log("[bundle-remotion] outDir:", outDir);

  const serveUrl = await bundle({
    entryPoint,
    publicDir,
    outDir,
    symlinkPublicDir: true,
  });

  const marker = path.join(process.cwd(), ".remotion-bundle-path");
  await fs.writeFile(marker, serveUrl, "utf8");
  console.log("[bundle-remotion] ready:", serveUrl);
}

main().catch((err) => {
  console.error("[bundle-remotion] failed:", err);
  process.exit(1);
});
