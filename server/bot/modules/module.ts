// What a module of the bot is on the server: each part optional. Its settings, views and acts are declared in the law
// (`law/modules.ts`), which the panel draws; this is the code that answers them.

import type { Settings } from '../law/settings.ts';
import type { BotContext, Interaction, InteractionReply } from '../kit.ts';
import type { SlotUser } from '../slots.ts';

/** A Gateway event's data as Discord sends it; the dispatcher adds `previous`, what the cache held before. */
export type EventData = Record<string, unknown> & { previous?: unknown };
/** Who acts from the panel: their roles and permissions in the server, and whether they may give some roles. */
export interface Actor {
  readonly id: string;
  readonly name: string;
  readonly avatar?: string | null;
  readonly roles: readonly string[];
  readonly permissions: bigint;
  readonly owner: boolean;
  readonly mayGive: (roleIds: readonly string[]) => { readonly role: string; readonly why: string } | null;
}

/** Runs in a server where the module is on, with its settings. */
export type EventHandler = (context: BotContext, data: EventData, config: Settings) => Promise<void>;
export type CommandHandler = (
  context: BotContext,
  interaction: Interaction,
  config: Settings,
) => Promise<InteractionReply>;
/** A press of something the module drew: its custom id is `bot:<module id>:<words>`, and `words` are what follow. */
export type ComponentHandler = (
  context: BotContext,
  interaction: Interaction,
  words: readonly string[],
  config: Settings,
) => Promise<InteractionReply>;
/** One of the module's tables in the panel. */
export type ViewReader = (
  context: BotContext,
  guildId: string,
  query: URLSearchParams,
) => Promise<{ rows: unknown[]; next?: string; note?: string }>;
/** One of the module's acts in the panel, its input already checked against the act's declared inputs. */
export type ActionRunner = (
  context: BotContext,
  guildId: string,
  input: Settings,
  actor: Actor,
  config: Settings,
) => Promise<{ ok: boolean; message: string }>;
/** Keeps something in Discord in step with a save (Discord's own AutoMod rules, say), and says how in a note. */
export type SaveStep = (context: BotContext, guildId: string, config: Settings, enabled: boolean) => Promise<string>;
/**
 * Values for placeholders only this module can fill (a welcome card's address, say), asked only when a message names
 * one of `names`; `fresh` is the module's settings where the caller has just read or saved them.
 */
export interface SlotSource {
  readonly names: readonly string[];
  readonly fill: (
    context: BotContext,
    guildId: string,
    user: SlotUser,
    vars: Readonly<Record<string, string>>,
    fresh?: Settings,
  ) => Promise<Record<string, string>>;
}

export interface ServerModule {
  /** The id of its shape in the law, which also names its settings, its tables and its acts. */
  readonly id: string;
  /** Its slash commands, as Discord takes them; the deploy writes every module's. */
  readonly commands?: readonly { readonly name: string; readonly [part: string]: unknown }[];
  readonly events?: Readonly<Record<string, EventHandler>>;
  readonly command?: CommandHandler;
  readonly component?: ComponentHandler;
  /** Runs each minute on the Worker's clock, in every server; one that throws stops no other. */
  readonly minute?: (context: BotContext) => Promise<void>;
  readonly views?: Readonly<Record<string, ViewReader>>;
  readonly actions?: Readonly<Record<string, ActionRunner>>;
  readonly saved?: SaveStep;
  readonly slots?: SlotSource;
  /** Its own public routes on the Worker (a card's picture, a public board): null for a request that is not one. */
  readonly fetch?: (context: BotContext, request: Request, url: URL) => Promise<Response | null>;
}
