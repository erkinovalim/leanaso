"use client";

import Form from "next/form";
import { useEffect, useId, useRef, useState } from "react";
import { COUNTRIES } from "@/lib/countries";
import type { Store } from "@/lib/stores";
import { useTranslated } from "./translation";

// Dropdown order; COUNTRIES itself stays as is because its first entry is the default.
const SORTED_COUNTRIES = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, "en"));

export function SearchForm({
  keyword = "",
  country = "us",
  store = "app",
}: {
  keyword?: string;
  country?: string;
  store?: Store;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState(keyword);
  const [countryCode, setCountryCode] = useState(country);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [active, setActive] = useState(-1);

  // Fetch the store's suggestions for what's typed, debounced.
  useEffect(() => {
    const term = query.trim();
    if (!term) return; // the list is hidden for an empty box (see showList)
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/suggest?q=${encodeURIComponent(term)}&c=${countryCode}&s=${store}`,
          {
            signal: ctrl.signal,
          },
        );
        const data: unknown = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
        setActive(-1);
      } catch {
        // aborted or offline: keep whatever is showing
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, countryCode, store]);

  function choose(term: string) {
    if (inputRef.current) inputRef.current.value = term;
    setQuery(term);
    formRef.current?.requestSubmit();
  }

  const showList = query.trim() !== "" && suggestions.length > 0;
  const translation = useTranslated(showList ? suggestions : []);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && showList) {
      e.preventDefault();
      const n = suggestions.length;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n));
    } else if (e.key === "Enter" && showList && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setActive(-1);
    }
  }

  return (
    // `contents` so the search row below can stick to the top of the page for
    // the whole scroll; a sticky child is otherwise confined to its parent.
    <Form ref={formRef} action="/" className="contents">
      {store === "play" && <input type="hidden" name="s" value="play" />}
      <div className="sticky top-0 z-20 -mx-4 flex flex-col gap-2 bg-background px-4 py-2 sm:flex-row">
        <input
          ref={inputRef}
          name="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Keyword, e.g. habit tracker"
          required
          maxLength={100}
          autoFocus={!keyword}
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && active >= 0 ? `${listId}-${active}` : undefined
          }
          className="h-11 w-full min-w-0 rounded-lg border border-neutral-300 bg-white px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:flex-1 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div className="flex gap-2">
          <select
            name="c"
            defaultValue={country}
            onChange={(e) => setCountryCode(e.target.value)}
            aria-label="Country"
            className="h-11 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2 outline-none focus:border-blue-500 sm:w-48 sm:flex-none dark:border-neutral-700 dark:bg-neutral-900"
          >
            {SORTED_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <TranslateButton {...translation} />
          <button className="h-11 rounded-lg bg-blue-600 px-5 font-medium text-white hover:bg-blue-700">
            Search
          </button>
        </div>
      </div>
      {translation.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {translation.error}
        </p>
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Store suggestions"
          className="divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900"
        >
          {/* Same order the App Store app shows them in */}
          {suggestions.map((s, i) => (
            <li
              key={s}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onClick={() => choose(s)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[15px] hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                i === active ? "bg-neutral-100 dark:bg-neutral-800" : ""
              }`}
            >
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                className="size-4 shrink-0 text-neutral-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="8.5" cy="8.5" r="5.5" />
                <path d="m13 13 4 4" />
              </svg>
              {/* The original stays the search term; English is shown beside it. */}
              <span className="truncate">{s}</span>
              <English original={s} english={translation.english(s)} />
            </li>
          ))}
        </ul>
      )}
    </Form>
  );
}

function English({ original, english }: { original: string; english: string | null }) {
  if (!english || english.toLowerCase() === original.toLowerCase()) return null;
  return <span className="truncate text-sm text-neutral-500">{english}</span>;
}

function TranslateButton({
  enabled,
  pending,
  error,
  toggle,
}: {
  enabled: boolean;
  pending: boolean;
  error: string | null;
  toggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      title={error ?? (enabled ? "Show original text" : "Translate suggestions and results to English")}
      className={`flex h-11 shrink-0 items-center gap-2 rounded-lg border px-3 font-medium ${
        enabled
          ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300"
          : "border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      }`}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className={`size-5 ${pending ? "animate-pulse" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" />
      </svg>
      <span className="sr-only sm:not-sr-only">{pending ? "Translating…" : "Translate"}</span>
    </button>
  );
}
