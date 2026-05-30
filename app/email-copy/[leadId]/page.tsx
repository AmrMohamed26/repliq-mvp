import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVideoIndex } from "@/lib/session";
import { firstNameFromName } from "@/lib/personalized-message";
import { CopyEmailPanel } from "@/components/email/CopyEmailPanel";

type PageProps = { params: Promise<{ leadId: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { leadId } = await params;
  const index = await getVideoIndex(leadId);
  const first = index ? firstNameFromName(index.name) : "Lead";
  return { title: `Copy email · ${first}` };
}

export default async function EmailCopyPage({ params }: PageProps) {
  const { leadId } = await params;
  const index = await getVideoIndex(leadId);

  if (!index?.videoUrl?.startsWith("https://")) {
    notFound();
  }

  return <CopyEmailPanel leadId={leadId} name={index.name} />;
}
