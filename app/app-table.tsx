"use client";

import { useState } from "react";
import type { App } from "@/lib/appstore";
import { ago, compact, monthYear } from "@/lib/format";
import type { InAppPurchase } from "@/lib/iap";
import type { Store } from "@/lib/stores";
import { useTranslated } from "./translation";

type IapState = InAppPurchase[] | "loading" | "error";
type Id = App["id"];

/**
 * Results table. Clicking a row expands its screenshots and in-app purchases (Google Play
 * only shows a price range); the title links to the store. While the search bar's Translate switch is on,
 * titles, subtitles and in-app purchase names (including ones expanded later) show in English.
 */
export function AppTable({ apps, country, store }: { apps: App[]; country: string; store: Store }) {
  const [open, setOpen] = useState<Set<Id>>(new Set());
  const [iaps, setIaps] = useState<Record<Id, IapState>>({});
  const loadedIaps = Object.values(iaps).flatMap((s) => (Array.isArray(s) ? s.map((p) => p.name) : []));
  const { english } = useTranslated([
    ...apps.map((a) => a.name),
    ...apps.flatMap((a) => (a.subtitle ? [a.subtitle] : [])),
    ...loadedIaps,
  ]);
  const t = (text: string) => english(text) ?? text;

  function toggleRow(app: App) {
    const id = app.id;
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
    if (iaps[id] && iaps[id] !== "error") return;
    if (app.hasIap === false) return setIaps((prev) => ({ ...prev, [id]: [] }));
    if (store === "play") {
      const list = app.iapRange ? [{ name: "Price range", price: app.iapRange }] : [];
      return setIaps((prev) => ({ ...prev, [id]: list }));
    }
    setIaps((prev) => ({ ...prev, [id]: "loading" }));
    fetch(`/api/iap?id=${id}&c=${country}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(
        (list: InAppPurchase[]) => {
          setIaps((prev) => ({ ...prev, [id]: list }));
        },
        () => setIaps((prev) => ({ ...prev, [id]: "error" })),
      );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
            <tr>
              <Th className="w-10 text-center">#</Th>
              <Th>App</Th>
              <Th className="text-right">Rating</Th>
              <Th className="text-right">Ratings</Th>
              <Th>Price</Th>
              <Th>IAP</Th>
              <Th>Category</Th>
              <Th>Released</Th>
              <Th>Updated</Th>
              <Th className="text-right">{store === "play" ? "Installs" : "Size"}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {apps.map((a) => (
              <AppRow
                key={a.id}
                app={a}
                open={open.has(a.id)}
                iaps={iaps[a.id]}
                onToggle={() => toggleRow(a)}
                t={t}
                store={store}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AppRow({
  app: a,
  open,
  iaps,
  onToggle,
  t,
  store,
}: {
  app: App;
  open: boolean;
  iaps: IapState | undefined;
  onToggle: () => void;
  t: (text: string) => string;
  store: Store;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        aria-expanded={open}
        className={`cursor-pointer outline-none hover:bg-neutral-50 focus-visible:bg-neutral-50 dark:hover:bg-neutral-900/60 dark:focus-visible:bg-neutral-900/60 ${open ? "bg-neutral-50 dark:bg-neutral-900/60" : ""}`}
      >
        <td className="px-3 py-2.5 text-center text-neutral-500 tabular-nums">
          <span className="inline-flex items-center gap-1">
            <svg viewBox="0 0 16 16" aria-hidden className={`size-3 transition-transform ${open ? "rotate-90" : ""}`}>
              <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            {a.rank}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex max-w-md items-center gap-3 pr-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.icon}
              alt=""
              width={40}
              height={40}
              loading="lazy"
              // Google Play's image server rejects (429) requests with a
              // localhost/unknown Referer, so icons are loaded without one.
              referrerPolicy="no-referrer"
              className="size-10 shrink-0 rounded-[22%] border border-neutral-200 dark:border-neutral-800"
            />
            <span className="min-w-0">
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={a.name}
                className="block truncate font-medium hover:text-blue-600 hover:underline dark:hover:text-blue-400"
              >
                {t(a.name)}
              </a>
              <span className="block truncate text-xs text-neutral-500">
                {a.subtitle ? `${t(a.subtitle)} · ` : ""}
                {a.developer}
              </span>
            </span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
          {a.rating ? `★ ${a.rating.toFixed(1)}` : "—"}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums" title={a.ratingCount.toLocaleString("en-US")}>
          {compact(a.ratingCount)}
        </td>
        <td className="px-3 py-2.5">{a.price}</td>
        <td className="px-3 py-2.5">
          {a.hasIap === null ? (
            <span className="text-neutral-400">—</span>
          ) : a.hasIap ? (
            <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              Yes
            </span>
          ) : (
            <span className="text-xs text-neutral-500">No</span>
          )}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">{a.category}</td>
        <td className="px-3 py-2.5 whitespace-nowrap" title={a.released?.slice(0, 10)}>
          {a.released ? monthYear(a.released) : "—"}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap" title={a.updated.slice(0, 10)}>
          {ago(a.daysSinceUpdate)}
        </td>
        <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
          {store === "play"
            ? a.installs !== null
              ? `${compact(a.installs)}+`
              : "—"
            : a.sizeBytes
              ? `${Math.round(a.sizeBytes / 1e6)} MB`
              : "—"}
        </td>
      </tr>
      {open && (
        <tr className="bg-neutral-50 dark:bg-neutral-900/60">
          <td />
          <td colSpan={9} className="space-y-4 px-3 pt-1 pb-4">
            <Screenshots app={a} />
            <IapList iaps={iaps} t={t} store={store} />
          </td>
        </tr>
      )}
    </>
  );
}

/** The store's screenshots in a sideways-scrolling strip; each opens full size. */
function Screenshots({ app }: { app: App }) {
  if (!app.screenshots.length) {
    return <p className="text-xs text-neutral-500">No screenshots.</p>;
  }
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium text-neutral-500 uppercase">Screenshots</h3>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {app.screenshots.map((src, i) => (
          <a key={src} href={src} target="_blank" rel="noreferrer" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`${app.name} screenshot ${i + 1}`}
              loading="lazy"
              referrerPolicy="no-referrer" // see the icon above
              className="h-64 w-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-800"
            />
          </a>
        ))}
      </div>
    </div>
  );
}

function IapList({
  iaps,
  t,
  store,
}: {
  iaps: IapState | undefined;
  t: (text: string) => string;
  store: Store;
}) {
  if (!iaps || iaps === "loading") {
    return <p className="text-xs text-neutral-500">Loading in-app purchases…</p>;
  }
  if (iaps === "error") {
    return <p className="text-xs text-red-600 dark:text-red-400">Couldn&apos;t load in-app purchases.</p>;
  }
  if (!iaps.length) {
    return <p className="text-xs text-neutral-500">No in-app purchases.</p>;
  }
  return (
    <div className="max-w-md">
      <h3 className="mb-1.5 text-xs font-medium text-neutral-500 uppercase">
        In-app purchases{iaps.length >= 10 ? " · top 10" : ""}
      </h3>
      {store === "play" && (
        <p className="mb-1.5 text-xs text-neutral-500">
          Google Play shows a price range, not individual items.
        </p>
      )}
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950">
        {iaps.map((p, i) => (
          <li key={i} className="flex justify-between gap-4 px-3 py-1.5 text-sm">
            <span className="truncate" title={p.name}>
              {t(p.name)}
            </span>
            <span className="shrink-0 tabular-nums">{p.price}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>;
}
