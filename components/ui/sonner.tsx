"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: "hsl(0 0% 8%)",
          border: "1px solid hsl(0 0% 14%)",
          color: "hsl(0 0% 95%)",
          borderRadius: "12px",
          fontSize: "13px",
        },
      }}
    />
  );
}
