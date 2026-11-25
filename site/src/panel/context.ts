// What a module's form is drawn with: the server's channels, roles and emoji as the bot's snapshot holds them, whether
// the person may change anything, what a message's preview fills its placeholders with, and what the composer may ask
// of the bot. Each drawn field answers as a Bound.

export interface Channel {
  readonly id: string;
  readonly name: string;
  readonly type: number;
  readonly parentId: string | null;
  readonly position: number;
}
export interface Role {
  readonly id: string;
  readonly name: string;
  readonly color: number;
  readonly position: number;
  readonly managed: boolean;
}
export interface ServerEmoji {
  readonly id: string;
  readonly name: string;
  readonly animated: boolean;
}
/** What a message's preview shows of the server and the person: its name and icon, its members, who is signed in. */
export interface PreviewContext {
  guildName?: string;
  guildIcon?: string;
  memberCount?: number;
  me?: { readonly name: string; readonly avatar: string };
  cardUrl?: string;
}
export interface ComposerTools {
  readonly sendTest?: (message: unknown, to: string) => Promise<{ ok: boolean; message: string }>;
  readonly upload?: (file: Blob) => Promise<{ ok: boolean; url?: string; message?: string }>;
}
export interface FormContext {
  readonly channels: readonly Channel[];
  readonly roles: readonly Role[];
  readonly disabled: boolean;
  readonly preview?: PreviewContext;
  readonly emojis?: readonly ServerEmoji[];
  readonly tools?: ComposerTools;
}
/** One drawn field: its element, its value read back, and a refusal shown where its path is the field's own. */
export interface Bound {
  readonly element: HTMLElement;
  readonly read: () => unknown;
  readonly mark: (path: string, message: string) => boolean;
  readonly refresh?: () => void;
}
