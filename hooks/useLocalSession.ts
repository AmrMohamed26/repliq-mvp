"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "repliq_session_id";

export function useLocalSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const createSession = useCallback(async (): Promise<string> => {
    const res = await fetch("/api/session", { method: "POST" });
    if (!res.ok) throw new Error("Failed to create session");
    const { sessionId: id } = await res.json();
    sessionStorage.setItem(STORAGE_KEY, id);
    setSessionId(id);
    return id;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forceReset = params.get("reset") === "1";

    if (forceReset) {
      sessionStorage.removeItem(STORAGE_KEY);
      createSession().then(() => {
        setIsReady(true);
        window.history.replaceState(null, "", window.location.pathname);
      });
      return;
    }

    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      fetch(`/api/session/${stored}`)
        .then((r) => {
          if (r.ok) {
            return r.json().then((body) => {
              const reusableStages = ["created", "csv_uploaded", "video_uploaded"];
              if (reusableStages.includes(body?.stage)) {
                setSessionId(stored);
                setIsReady(true);
                return;
              }
              sessionStorage.removeItem(STORAGE_KEY);
              return createSession().then(() => setIsReady(true));
            });
          }
          sessionStorage.removeItem(STORAGE_KEY);
          return createSession().then(() => setIsReady(true));
        })
        .catch(() => {
          sessionStorage.removeItem(STORAGE_KEY);
          return createSession().then(() => setIsReady(true));
        });
    } else {
      createSession().then(() => setIsReady(true));
    }
  }, [createSession]);

  const resetSession = useCallback(async () => {
    sessionStorage.removeItem(STORAGE_KEY);
    return createSession();
  }, [createSession]);

  return { sessionId, isReady, resetSession };
}
