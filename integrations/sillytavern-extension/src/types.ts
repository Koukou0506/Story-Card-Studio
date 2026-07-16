import type { ChatRange } from "../../../src/integrations/sillytavern/contracts";

export interface STChatMessage { mes?: unknown; is_user?: unknown; name?: unknown; send_date?: unknown; extra?: unknown }
export interface STCharacter { name?: unknown; avatar?: unknown; date_last_chat?: unknown; data?: unknown }
export interface STGroup { id?: unknown; name?: unknown; members?: unknown }
export interface SillyTavernContextLike {
  characterId?: unknown; groupId?: unknown; chatId?: unknown; characters?: unknown; groups?: unknown; chat?: unknown;
  chatMetadata?: Record<string, unknown>; extensionSettings?: Record<string, unknown>; saveSettingsDebounced?: () => void;
  saveMetadata?: () => Promise<void>; writeExtensionField?: (characterId: number, key: string, value: unknown) => Promise<void>;
  getWorldInfoNames?: () => string[]; loadWorldInfo?: (name: string) => Promise<unknown>; saveWorldInfo?: (name: string, data: unknown, immediately?: boolean) => Promise<void>;
  eventSource?: { on: (event: string, handler: (...args: unknown[]) => void) => void; off?: (event: string, handler: (...args: unknown[]) => void) => void };
  eventTypes?: Record<string, string>; event_types?: Record<string, string>;
  libs?: { DOMPurify?: { sanitize: (html: string) => string } };
  persona?: { name?: unknown; description?: unknown };
}

export interface SnapshotOptions { chatRange: ChatRange; includeWorldInfo?: boolean; selectedGroupMembers?: string[]; includePersona?: boolean }

declare global {
  interface Window { SillyTavern?: { getContext(): SillyTavernContextLike; libs?: SillyTavernContextLike["libs"] }; toastr?: { success(message: string): void; error(message: string): void; warning(message: string): void } }
}
