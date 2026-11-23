import { cacheLife } from "next/cache";

export class TranslationNotConfigured extends Error {}

/**
 * Translates texts to English with DeepL (key in DEEPL_API_KEY). Texts go in
 * batches of 50, DeepL's per-request limit; each batch is cached, so repeat
 * searches don't spend quota.
 */
export async function translateToEnglish(texts: string[]): Promise<string[]> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new TranslationNotConfigured();
  const batches = Array.from({ length: Math.ceil(texts.length / 50) }, (_, i) =>
    texts.slice(i * 50, i * 50 + 50),
  );
  return (await Promise.all(batches.map((b) => translateBatch(b, key)))).flat();
}

async function translateBatch(texts: string[], key: string): Promise<string[]> {
  "use cache";
  cacheLife("weeks");
  // Free-plan keys end in ":fx" and use a separate host.
  const host = key.endsWith(":fx") ? "api-free.deepl.com" : "api.deepl.com";
  const res = await fetch(`https://${host}/v2/translate`, {
    method: "POST",
    headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: texts, target_lang: "EN-US" }),
  });
  if (!res.ok) throw new Error(`DeepL failed (${res.status})`);
  const data: { translations: { text: string }[] } = await res.json();
  return data.translations.map((t) => t.text);
}
