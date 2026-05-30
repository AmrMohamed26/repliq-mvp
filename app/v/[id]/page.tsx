import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVideoIndex } from "@/lib/session";
import { firstNameFromName } from "@/lib/personalized-message";
import { VideoLanding } from "@/components/watch/VideoLanding";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const index = await getVideoIndex(id);
  const first = index ? firstNameFromName(index.name) : "Video";
  return {
    title: `${first}'s video`,
  };
}

export default async function WatchVideoPage({ params }: PageProps) {
  const { id } = await params;
  const index = await getVideoIndex(id);

  if (!index?.videoUrl?.startsWith("https://")) {
    notFound();
  }

  const thumb = index.thumbnailUrl?.startsWith("https://")
    ? index.thumbnailUrl
    : undefined;

  return (
    <VideoLanding
      name={index.name}
      videoUrl={index.videoUrl}
      thumbnailUrl={thumb}
    />
  );
}
