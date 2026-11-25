// The ask a passage zone's room is opened by for a page playing alone, as room-wasm's `open_passage` reads it.

/** The ask a passage zone's room is opened by, as room-wasm's `open_passage` reads it. */
export function passageAsk(island: string, week: number, zone: number, company: boolean, minute: number): string {
  return JSON.stringify({ island, week, zone, route: company ? 'company' : 'public', minute });
}
