import { ensureWebRedisConnected } from "./redis";

const TTL_SEC = 60 * 60 * 24;

export function slugKey(slug: string): string {
  return `slug:${slug}`;
}

/**
 * "John Smith" → john-smith
 * "Acme Inc." → acme-inc
 */
export function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "video";
}

function candidateSlug(base: string, suffix: number): string {
  return suffix === 0 ? base : `${base}-${suffix}`;
}

async function isSlugTaken(slug: string): Promise<boolean> {
  const redis = await ensureWebRedisConnected();
  return (await redis.exists(slugKey(slug))) === 1;
}

function isTakenInBatch(slug: string, batchReserved: Set<string>): boolean {
  return batchReserved.has(slug);
}

/**
 * Allocates a unique slug for a lead name (global within Redis TTL window).
 * First "John Smith" → john-smith; next → john-smith-1, then john-smith-2, …
 */
export async function allocateUniqueSlug(
  name: string,
  batchReserved = new Set<string>(),
): Promise<string> {
  const base = slugifyName(name);

  for (let suffix = 0; suffix < 10_000; suffix++) {
    const slug = candidateSlug(base, suffix);
    if (isTakenInBatch(slug, batchReserved)) continue;
    if (await isSlugTaken(slug)) continue;
    batchReserved.add(slug);
    return slug;
  }

  throw new Error(`Could not allocate unique slug for name: ${name}`);
}

export async function registerSlugMapping(
  slug: string,
  leadId: string,
): Promise<void> {
  const redis = await ensureWebRedisConnected();
  await redis.set(slugKey(slug), leadId, "EX", TTL_SEC);
}

/**
 * Resolves a public path segment (/v/[id]) to the internal lead ID.
 * Tries legacy video:{segment} first, then slug:{segment} → leadId.
 */
export async function resolveLeadId(publicId: string): Promise<string> {
  const redis = await ensureWebRedisConnected();
  const directIndex = await redis.get(`video:${publicId}`);
  if (directIndex) return publicId;

  const fromSlug = await redis.get(slugKey(publicId));
  if (fromSlug) return fromSlug;

  return publicId;
}
