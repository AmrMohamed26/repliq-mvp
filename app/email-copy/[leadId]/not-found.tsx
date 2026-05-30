export default function EmailCopyNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-6 text-center text-[#fafafa]">
      <h1 className="text-xl font-semibold">Email not ready</h1>
      <p className="mt-2 max-w-sm text-sm text-[#737373]">
        This lead has not finished processing or the video link has expired.
      </p>
    </div>
  );
}
