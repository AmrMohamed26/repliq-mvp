import type { Metadata } from "next";
import { WizardClient } from "@/components/wizard/WizardClient";

export const metadata: Metadata = {
  title: "New Batch",
};

export default function NewPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-12">
      <WizardClient />
    </main>
  );
}
