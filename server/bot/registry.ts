// Every server-side module, in one list. Commands, buttons, Gateway events, the clock, placeholders and the panel's
// tables and acts are all routed from here.

import type { BotContext } from './kit.ts';
import type { EventData, ServerModule } from './modules/module.ts';

// A module is added in two steps: its shape in `law/modules.ts` (what the panel draws and the bot checks), and its
// code as one file in `modules/` exporting a `ServerModule` with the same id, named in the list below. Its tables, if
// it has any, come with a migration in `migrations/` named by its UTC time.
export const SERVER_MODULES: readonly ServerModule[] = Object.freeze([]);

/** A module list, ready to route: tests build one of their own. */
export interface Registry {
  readonly modules: readonly ServerModule[];
  readonly byId: (id: string) => ServerModule | null;
  /** Every module's slash commands. */
  readonly commands: readonly { readonly name: string }[];
  /** The module that answers a slash command. */
  readonly commandOwner: (name: string) => ServerModule | null;
}

export function registryOf(modules: readonly ServerModule[]): Registry {
  const byCommand = new Map(
    modules.flatMap((shape) => (shape.commands ?? []).map((spec) => [String(spec.name), shape] as const)),
  );
  return {
    modules,
    byId: (id) => modules.find((shape) => shape.id === id) ?? null,
    commands: Object.freeze(modules.flatMap((shape) => shape.commands ?? [])),
    commandOwner: (name) => byCommand.get(name) ?? null,
  };
}

export const REGISTRY = registryOf(SERVER_MODULES);

/** The server an event belongs to: its `guild_id`, or its own id for an event about the server itself. */
export function guildOfEvent(type: string, data: EventData): string {
  if (typeof data.guild_id === 'string') return data.guild_id;
  if (type.startsWith('GUILD_') && typeof data.id === 'string' && !('user' in data)) return data.id;
  return '';
}

export type DispatchHandler = (type: string, data: EventData) => Promise<void>;

/** The Gateway's handlers for every module, by event name: each one runs only where its module is on. */
export function moduleHandlers(context: BotContext, registry: Registry = REGISTRY): Record<string, DispatchHandler[]> {
  const out: Record<string, DispatchHandler[]> = {};
  for (const shape of registry.modules) {
    for (const [type, handler] of Object.entries(shape.events ?? {})) {
      (out[type] ??= []).push(async (eventType, data) => {
        const guildId = guildOfEvent(eventType, data);
        if (!guildId) return;
        const found = await context.config(guildId, shape.id);
        if (found?.enabled) await handler(context, data, found.config);
      });
    }
  }
  return out;
}
