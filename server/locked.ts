/** The kinds of node locked until a pass is done on them: each opens once the open list names it. */
const LOCKABLE: readonly string[] = ['patrol', 'mission'];

/** Why a node's room turns every player away, from its baked file's text and the open list
 *  (`content/world/open.json`): a patrol area or mission the list does not name is locked. Null for a node anyone may
 *  join. A landing, a gate and a company's join all come in as a join to the node's room, so this one answer holds
 *  each of them out. */
export function lockedReason(nodeText: string, open: readonly string[]): string | null {
  const node = JSON.parse(nodeText) as { readonly id: string; readonly kind: string; readonly name: string };
  return LOCKABLE.includes(node.kind) && !open.includes(node.id) ? `${node.name} is locked` : null;
}
