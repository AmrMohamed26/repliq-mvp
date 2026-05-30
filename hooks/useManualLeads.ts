"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  createEmptyManualContact,
  manualContactsToLeads,
  validateAllManualContacts,
  type ManualContactFieldErrors,
  type ManualContactInput,
} from "@/lib/manual-leads";
import type { Lead } from "@/types/lead";

export function useManualLeads(sessionId: string | null) {
  const [contacts, setContacts] = useState<ManualContactInput[]>([]);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, ManualContactFieldErrors>
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const ensureInitialContact = useCallback(() => {
    setContacts((prev) =>
      prev.length === 0 ? [createEmptyManualContact()] : prev,
    );
  }, []);

  const addContact = useCallback(() => {
    setContacts((prev) => [...prev, createEmptyManualContact()]);
  }, []);

  const removeContact = useCallback((id: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const updateContact = useCallback(
    (id: string, patch: Partial<ManualContactInput>) => {
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      );
    },
    [],
  );

  const validateAndGetLeads = useCallback((): Lead[] | null => {
    setTouched(true);
    const errors = validateAllManualContacts(contacts);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("Fix validation errors before continuing");
      return null;
    }
    return manualContactsToLeads(contacts);
  }, [contacts]);

  const saveLeads = useCallback(
    async (leads: Lead[]): Promise<Lead[] | null> => {
      if (!sessionId) {
        toast.error("No active session — please refresh");
        return null;
      }

      setIsSaving(true);
      try {
        const res = await fetch("/api/upload/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, leads }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Failed to save leads");
          return null;
        }
        toast.success(`${data.count} lead(s) saved`);
        return data.leads as Lead[];
      } catch {
        toast.error("Network error — could not save leads");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [sessionId],
  );

  return {
    contacts,
    fieldErrors,
    isSaving,
    touched,
    ensureInitialContact,
    addContact,
    removeContact,
    updateContact,
    validateAndGetLeads,
    saveLeads,
    setContacts,
  };
}
