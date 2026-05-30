import Papa from "papaparse";
import { stringify } from "csv-stringify/sync";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { Lead } from "@/types/lead";
import type { LeadResult } from "@/types/lead";
import { getPublicAppBaseUrl } from "@/lib/app-url";
import { getEmailHtmlForResult } from "@/lib/email";

// ─── Validation ────────────────────────────────────────────────────────────

function normalizeWebsite(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;
}

function isBlankCsvRow(row: Record<string, string> | undefined): boolean {
  if (!row) return true;
  return Object.values(row).every((v) => !String(v ?? "").trim());
}

/** website column, or common aliases (headers are lowercased by Papa). */
function websiteFromRow(row: Record<string, string> | undefined): string {
  if (!row) return "";
  return (
    row.website ??
    row.url ??
    row.link ??
    row.site ??
    ""
  ).trim();
}

function parseCsvRow(
  row: Record<string, string> | undefined,
): { ok: true; data: { name: string; email: string; website: string } } | { ok: false; message: string } {
  const name = (row?.name ?? "").trim();
  const email = (row?.email ?? "").trim().toLowerCase();
  const websiteRaw = websiteFromRow(row);

  if (!websiteRaw) {
    return { ok: false, message: "website is required" };
  }

  const website = normalizeWebsite(websiteRaw);
  const websiteCheck = z.string().url("invalid website URL").safeParse(website);
  if (!websiteCheck.success) {
    return {
      ok: false,
      message: websiteCheck.error.issues[0]?.message ?? "invalid website URL",
    };
  }

  if (email.length > 0) {
    const emailCheck = z.string().email("invalid email").safeParse(email);
    if (!emailCheck.success) {
      return {
        ok: false,
        message: emailCheck.error.issues[0]?.message ?? "invalid email",
      };
    }
  }

  return {
    ok: true,
    data: { name, email, website: websiteCheck.data },
  };
}

export interface ParseResult {
  leads: Lead[];
  errors: { row: number; message: string }[];
}

// ─── Parse ─────────────────────────────────────────────────────────────────

export function parseCsv(rawCsv: string): ParseResult {
  const { data, errors: parseErrors } = Papa.parse<Record<string, string>>(
    rawCsv.trim(),
    {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    },
  );

  const leads: Lead[] = [];
  const errors: { row: number; message: string }[] = [];

  for (const pe of parseErrors) {
    errors.push({
      row: typeof pe.row === "number" ? pe.row + 1 : 0,
      message: pe.message ?? "CSV parse warning",
    });
  }

  if (data.length === 0) {
    if (parseErrors.length > 0) {
      throw new Error(
        `CSV could not be read: ${parseErrors.map((e) => e.message).join("; ")}`,
      );
    }
    return { leads, errors };
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (isBlankCsvRow(row)) {
      continue;
    }

    const parsed = parseCsvRow(row);

    if (!parsed.ok) {
      errors.push({
        row: i + 2,
        message: parsed.message,
      });
      continue;
    }

    leads.push({
      id: nanoid(),
      name: parsed.data.name,
      email: parsed.data.email,
      website: parsed.data.website,
    });
  }

  return { leads, errors };
}

// ─── Export ────────────────────────────────────────────────────────────────

/**
 * Column order:
 *   leadId, name, website, shortUrl, videoUrl, thumbnailUrl, emailHtml, status
 *
 * emailHtml — same HTML as Copy Email (minified one line for spreadsheet cells).
 * Use Copy Email on the app for rich Gmail paste; re-process leads for new thumbnails.
 */
export function buildExportCsv(
  results: LeadResult[],
  requestOrigin?: string,
): string {
  const emailOrigin = requestOrigin ?? getPublicAppBaseUrl();
  const rows = results.map((r) => ({
    leadId: r.id,
    name: r.name,
    website: r.website,
    shortUrl:
      r.shortUrl && !r.shortUrl.includes(".mp4") ? r.shortUrl
      : r.videoUrl?.startsWith("https://") ? ""
      : "",
    videoUrl: r.videoUrl?.startsWith("https://") ? r.videoUrl : "",
    thumbnailUrl: r.thumbnailUrl?.startsWith("https://") ? r.thumbnailUrl : "",
    emailHtml: getEmailHtmlForResult(r, true, emailOrigin),
    status: r.status,
  }));

  return stringify(rows, {
    header: true,
    columns: [
      "leadId",
      "name",
      "website",
      "shortUrl",
      "videoUrl",
      "thumbnailUrl",
      "emailHtml",
      "status",
    ],
  });
}
