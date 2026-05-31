import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { env } from "./env";
import { logger } from "./logger";

export function isSupabaseStorageConfigured(): boolean {
  return hasSupabaseConfig();
}

function hasSupabaseConfig(): boolean {
  return Boolean(
    env.SUPABASE_URL &&
      env.SUPABASE_SERVICE_ROLE_KEY &&
      env.SUPABASE_BUCKET &&
      env.SUPABASE_PUBLIC_BASE_URL,
  );
}

function requirePublicBaseUrl(): string {
  if (!env.SUPABASE_PUBLIC_BASE_URL) {
    throw new Error(
      "SUPABASE_PUBLIC_BASE_URL is required so generated video and thumbnail URLs are public HTTPS links.",
    );
  }
  if (!env.SUPABASE_PUBLIC_BASE_URL.startsWith("https://")) {
    throw new Error("SUPABASE_PUBLIC_BASE_URL must start with https://");
  }
  return env.SUPABASE_PUBLIC_BASE_URL.replace(/\/+$/, "");
}

function buildClient(): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _client: SupabaseClient | null | undefined = undefined;
function getClient(): SupabaseClient | null {
  if (_client === undefined) {
    _client = buildClient();
    if (!_client) {
      logger.warn(
        "Supabase Storage credentials not configured — public asset uploads will fail",
      );
    }
  }
  return _client;
}

/**
 * Canonical public HTTPS URL for a storage object.
 * Prefer Supabase getPublicUrl() so Gmail/image proxies resolve correctly after send.
 */
function publicUrl(key: string): string {
  const normalizedKey = key.replace(/^\//, "");
  const client = getClient();

  if (client && env.SUPABASE_BUCKET) {
    const { data } = client.storage
      .from(env.SUPABASE_BUCKET)
      .getPublicUrl(normalizedKey);
    if (data.publicUrl.startsWith("https://")) {
      return data.publicUrl;
    }
  }

  const base = requirePublicBaseUrl();
  return `${base}/${normalizedKey}`;
}

function assertStorageConfigured(): SupabaseClient {
  const client = getClient();
  if (!client || !hasSupabaseConfig()) {
    throw new Error(
      "Supabase Storage is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET, and SUPABASE_PUBLIC_BASE_URL to generate public HTTPS video links.",
    );
  }
  requirePublicBaseUrl();
  return client;
}

function assertPublicHttpsUrl(key: string): string {
  const url = publicUrl(key);
  if (!url.startsWith("https://")) {
    throw new Error(`Storage returned a non-public URL for ${key}`);
  }
  return url;
}

/** Upload a small object (for future JSON manifests, metadata, etc.). */
export async function putObject(
  key: string,
  body: Buffer | string,
  contentType: string,
): Promise<string> {
  const client = assertStorageConfigured();
  const { error } = await client.storage
    .from(env.SUPABASE_BUCKET)
    .upload(key, body, {
      contentType,
      upsert: true,
    });
  if (error) throw error;
  return assertPublicHttpsUrl(key);
}

/**
 * Upload a generated file and return a public HTTPS URL.
 */
export async function uploadFile(
  key: string,
  filePath: string,
  contentType: string,
): Promise<string> {
  const client = assertStorageConfigured();
  const file = await readFile(filePath);

  const { error } = await client.storage
    .from(env.SUPABASE_BUCKET)
    .upload(key, file, {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });
  if (error) throw error;

  const url = assertPublicHttpsUrl(key);
  logger.info({ key, url }, "uploaded asset to Supabase Storage");
  return url;
}

/** Download a storage object to a local path (worker pulls Vercel-uploaded talking heads). */
export async function downloadFileToPath(
  key: string,
  destPath: string,
): Promise<void> {
  const client = assertStorageConfigured();
  const { data, error } = await client.storage
    .from(env.SUPABASE_BUCKET)
    .download(key.replace(/^\//, ""));
  if (error) throw error;
  if (!data) throw new Error(`Empty download for ${key}`);

  await mkdir(dirname(destPath), { recursive: true });
  const buf = Buffer.from(await data.arrayBuffer());
  await writeFile(destPath, buf);
  logger.info({ key, destPath, bytes: buf.length }, "downloaded asset from Supabase Storage");
}
