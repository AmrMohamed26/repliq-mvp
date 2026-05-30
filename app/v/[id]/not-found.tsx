import Link from "next/link";

export default function VideoNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-6 text-center text-[#fafafa]">
      <h1 className="text-2xl font-semibold">Video not found</h1>
      <p className="mt-2 max-w-sm text-sm text-[#737373]">
        This link may have expired or the video has not been processed yet.
      </p>
      <Link
        href="/"
        className="mt-8 text-sm text-[#a3a3a3] underline underline-offset-4 hover:text-white"
      >
        Back to home
      </Link>
    </div>
  );
}
