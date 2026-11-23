export type Store = "app" | "play";

export function getStore(s: string | undefined): Store {
  return s === "play" ? "play" : "app";
}

export const STORE_NAMES: Record<Store, string> = { app: "App Store", play: "Google Play" };
export const STORE_OWNERS: Record<Store, string> = { app: "Apple", play: "Google" };
