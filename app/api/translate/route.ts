import { TranslationNotConfigured, translateToEnglish } from "@/lib/translate";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const texts: unknown = body?.texts;
  if (
    !Array.isArray(texts) ||
    texts.length > 500 ||
    !texts.every((t) => typeof t === "string" && t.length <= 500)
  ) {
    return Response.json({ error: "Expected { texts: string[] }" }, { status: 400 });
  }
  try {
    return Response.json({ translations: await translateToEnglish(texts) });
  } catch (e) {
    if (e instanceof TranslationNotConfigured) {
      return Response.json(
        { error: "Add DEEPL_API_KEY to .env.local and restart the dev server to enable translation." },
        { status: 501 },
      );
    }
    return Response.json({ error: "Translation failed. Try again in a moment." }, { status: 502 });
  }
}
