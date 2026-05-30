"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlurFade } from "@/components/shared/BlurFade";
import { ManualContactCard } from "./ManualContactCard";
import type { useManualLeads } from "@/hooks/useManualLeads";

type ManualLeadsApi = ReturnType<typeof useManualLeads>;

interface StepManualEntryProps {
  manual: ManualLeadsApi;
}

export function StepManualEntry({ manual }: StepManualEntryProps) {
  const {
    contacts,
    fieldErrors,
    ensureInitialContact,
    addContact,
    removeContact,
    updateContact,
  } = manual;

  useEffect(() => {
    ensureInitialContact();
  }, [ensureInitialContact]);

  const isEmpty = contacts.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <BlurFade delay={0}>
        <p className="text-sm text-muted-foreground">
          Add contacts one at a time. Name and website are required; email is
          optional.
        </p>
      </BlurFade>

      {isEmpty ? (
        <BlurFade delay={0.05}>
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border py-16 text-center">
            <div className="grid size-12 place-items-center rounded-full border border-border bg-secondary/40">
              <UserPlus className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">No contacts yet</p>
              <p className="text-xs text-muted-foreground">
                Add your first contact to build your lead list
              </p>
            </div>
            <Button type="button" onClick={addContact} size="lg">
              <Plus className="size-4" />
              Add Contact
            </Button>
          </div>
        </BlurFade>
      ) : (
        <div className="flex flex-col gap-4">
          <AnimatePresence mode="popLayout">
            {contacts.map((contact, index) => (
              <ManualContactCard
                key={contact.id}
                contact={contact}
                index={index}
                errors={fieldErrors[contact.id] ?? {}}
                canRemove={contacts.length > 1}
                onChange={(patch) => updateContact(contact.id, patch)}
                onRemove={() => removeContact(contact.id)}
              />
            ))}
          </AnimatePresence>

          <motion.div layout whileTap={{ scale: 0.98 }}>
            <Button
              type="button"
              variant="outline"
              onClick={addContact}
              className="w-full sm:w-auto"
            >
              <motion.span
                className="inline-flex items-center gap-2"
                whileHover={{ gap: 10 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
              >
                <Plus className="size-4" />
                Add Contact
              </motion.span>
            </Button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
