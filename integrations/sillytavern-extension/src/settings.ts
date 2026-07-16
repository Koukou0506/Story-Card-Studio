export const TOKEN_STORAGE_KEY = "story_card_studio_token";

export class ExtensionTokenStore {
  constructor(private readonly session: Storage, private readonly persistent: Storage) {}
  load(): string { return this.session.getItem(TOKEN_STORAGE_KEY) ?? this.persistent.getItem(TOKEN_STORAGE_KEY) ?? ""; }
  save(token: string, persist: boolean): void {
    this.clear();
    (persist ? this.persistent : this.session).setItem(TOKEN_STORAGE_KEY, token);
  }
  clear(): void { this.session.removeItem(TOKEN_STORAGE_KEY); this.persistent.removeItem(TOKEN_STORAGE_KEY); }
}

export function validateStudioUrl(value: string): string {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("远程 Story Card Studio 必须使用 HTTPS；仅 localhost 可使用 HTTP。");
  url.pathname = url.pathname.replace(/\/$/, ""); url.search = ""; url.hash = "";
  return url.toString().replace(/\/$/, "");
}
