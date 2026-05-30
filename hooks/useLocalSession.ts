"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "repliq_session_id";
const API_TIMEOUT_MS = 15_000;

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
}

export function useLocalSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const createSession = useCallback(async (): Promise<string> => {
    const res = await apiFetch("/api/session", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        typeof data?.error === "string"
          ? data.error
          : `Failed to create session (${res.status})`;
      throw new Error(msg);
    }
    const id = data.sessionId as string;
    if (!id) throw new Error("Invalid session response");
    sessionStorage.setItem(STORAGE_KEY, id);
    setSessionId(id);
    setSessionError(null);
    return id;
  }, []);

  const bootstrap = useCallback(async () => {
    setSessionError(null);

    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "1") {
      sessionStorage.removeItem(STORAGE_KEY);
      window.history.replaceState(null, "", window.location.pathname);
    }

    const stored = sessionStorage.getItem(STORAGE_KEY);

    try {
      if (stored) {
        const res = await apiFetch(`/api/session/${stored}`);
        if (res.ok) {
          const body = await res.json();
          const reusableStages = ["created", "csv_uploaded", "video_uploaded"];
          if (reusableStages.includes(body?.stage)) {
            setSessionId(stored);
            return;
          }
        }
        sessionStorage.removeItem(STORAGE_KEY);
      }

      await createSession();
    } catch (err) {
      sessionStorage.removeItem(STORAGE_KEY);
      setSessionId(null);
      setSessionError(
        err instanceof Error ? err.message : "Could not start session",
      );
    } finally {
      setIsReady(true);
    }
  }, [createSession]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const retrySession = useCallback(async () => {
    setIsReady(false);
    await bootstrap();
  }, [bootstrap]);

  const resetSession = useCallback(async () => {
    sessionStorage.removeItem(STORAGE_KEY);
    return createSession();
  }, [createSession]);

  return { sessionId, isReady, sessionError, retrySession, resetSession };
}
