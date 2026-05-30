import { nanoid } from "nanoid";
import { z } from "zod";
import type { Lead } from "@/types/lead";
import { classifyUpworkUrl } from "@/lib/upwork-lead";

export interface ManualContactInput {
  id: string;
  name: string;
  email: string;
  website: string;
  companyName?: string;
}

export interface ManualContactFieldErrors {
  name?: string;
  email?: string;
  website?: string;
}

const optionalEmailSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || z.string().email().safeParse(v).success, {
    message: "Enter a valid email address",
  });

const websiteSchema = z
  .string()
  .trim()
  .min(1, "Website URL is required")
  .transform((v) => (v.match(/^https?:\/\//i) ? v : `https://${v}`))
  .pipe(z.string().url("Enter a valid URL (e.g. https://example.com)"));

export function normalizeWebsiteInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;
}

export function validateManualContact(
  contact: ManualContactInput,
): ManualContactFieldErrors {
  const errors: ManualContactFieldErrors = {};

  if (!contact.name.trim()) {
    errors.name = "Name is required";
  }

  const emailResult = optionalEmailSchema.safeParse(contact.email);
  if (!emailResult.success) {
    errors.email = emailResult.error.issues[0]?.message ?? "Invalid email";
  }

  const websiteResult = websiteSchema.safeParse(contact.website);
  if (!websiteResult.success) {
    errors.website =
      websiteResult.error.issues[0]?.message ?? "Invalid website URL";
  }

  return errors;
}

export function contactHasErrors(errors: ManualContactFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function manualContactToLead(contact: ManualContactInput): Lead {
  const websiteResult = websiteSchema.safeParse(contact.website);
  const website = websiteResult.success
    ? websiteResult.data
    : normalizeWebsiteInput(contact.website);

  const lead: Lead = {
    id: nanoid(),
    name: contact.name.trim(),
    email: contact.email.trim().toLowerCase(),
    website,
  };

  if (contact.companyName?.trim()) {
    lead.metadata = { companyName: contact.companyName.trim() };
  }

  classifyUpworkUrl(lead.website);
  return lead;
}

export function manualContactsToLeads(contacts: ManualContactInput[]): Lead[] {
  return contacts.map(manualContactToLead);
}

export function validateAllManualContacts(
  contacts: ManualContactInput[],
): Record<string, ManualContactFieldErrors> {
  const byId: Record<string, ManualContactFieldErrors> = {};
  for (const contact of contacts) {
    const errors = validateManualContact(contact);
    if (contactHasErrors(errors)) {
      byId[contact.id] = errors;
    }
  }
  return byId;
}

export function createEmptyManualContact(): ManualContactInput {
  return {
    id: nanoid(),
    name: "",
    email: "",
    website: "",
    companyName: "",
  };
}
