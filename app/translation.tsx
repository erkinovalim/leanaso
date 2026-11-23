"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Translation = {
  enabled: boolean;
  pending: boolean;
  error: string | null;
  toggle: () => void;
  request: (texts: string[]) => void;
  /** English for `text` when translation is on and ready, otherwise null. */
  english: (text: string) => string | null;
};

const TranslationContext = createContext<Translation | null>(null);

/**
 * The "Translate" switch's state, shared by the suggestions list and the
 * results table. It sits above the keyed search parts, so it stays on (and
 * keeps its cache) across searches.
 */
export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [translations, setTranslations] = useState<Map<string, string>>(new Map());
  const [inFlight, setInFlight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(new Set<string>());

  const request = useCallback(async (texts: string[]) => {
    const todo = [...new Set(texts)].filter((x) => x.trim() && !requested.current.has(x));
    if (!todo.length) return;
    todo.forEach((x) => requested.current.add(x));
    setInFlight((n) => n + 1);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: todo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Translation failed.");
      setTranslations((prev) => {
        const next = new Map(prev);
        todo.forEach((x, i) => next.set(x, data.translations[i]));
        return next;
      });
    } catch (e) {
      todo.forEach((x) => requested.current.delete(x));
      setEnabled(false);
      setError((e as Error).message);
    } finally {
      setInFlight((n) => n - 1);
    }
  }, []);

  const value: Translation = {
    enabled,
    pending: enabled && inFlight > 0,
    error,
    toggle: () => {
      setError(null);
      setEnabled((on) => !on);
    },
    request,
    english: (text) => (enabled ? (translations.get(text) ?? null) : null),
  };

  return <TranslationContext value={value}>{children}</TranslationContext>;
}

export function useTranslation() {
  const ctx = useContext(TranslationContext);
  if (!ctx) throw new Error("useTranslation needs a TranslationProvider");
  return ctx;
}

/** Asks for `texts` in English while translation is on; returns the context. */
export function useTranslated(texts: string[]) {
  const ctx = useTranslation();
  const { enabled, request } = ctx;
  const key = texts.join("\u0000");
  useEffect(() => {
    if (enabled && key) request(key.split("\u0000"));
  }, [enabled, key, request]);
  return ctx;
}
