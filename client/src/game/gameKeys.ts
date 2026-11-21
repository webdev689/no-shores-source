// What the player's controls do outside the body's own moves (`player.ts`): the menus, the sea's asks, the helm's
// map, Use, Respawn, as a key or the pad presses them. Each acts only where its control does (`binds.ts`), so a key
// bound at the helm and on foot alike does each in its place. The story hears its keys itself.
import { type BindId, CONTROLS, type Context } from '../player/binds.ts';
import { BINDS, type Input, keyNameOf } from '../player/input.ts';
import type { DrawnInterface } from './drawnInterface.ts';
import type { Happening } from './flow.ts';
import type { Playing } from './gameFrame.ts';
import { openGearWindow } from './gearScreen.ts';
import { gearScreenOpen } from './gearWindow.ts';
import type { Hud } from './hud.ts';
import type { StoryHost } from './prologue/host.ts';
import { deckKey, fightAsk } from './seaWord.ts';

/** What the controls reach: the game as it plays, its input, interface and display, the story, and its deeds. */
export interface Controlled {
  readonly playing: Playing;
  readonly input: Input;
  readonly ui: DrawnInterface;
  readonly hud: Hud;
  readonly story: StoryHost | null;
  /** The travel to try again once one failed, while it waits. */
  readonly retry: () => (() => void) | null;
  readonly change: (happening: Happening) => void;
  readonly respawn: () => void;
  readonly goAshore: () => void;
  readonly stopOrResume: () => void;
  readonly openMap: () => void;
  readonly manage: () => void;
  readonly leaveHelm: () => void;
  readonly takeHelm: () => void;
  readonly goThrough: () => void;
  readonly landAt: (id: string) => void;
}

/** Where the player's controls act now: in a window, dead, at the helm, in a fight at sea, or on foot (on land, or
 *  walking a deck). */
export function contextOf(playing: Pick<Playing, 'flow' | 'sea' | 'foot'>): Context {
  const { flow, sea, foot } = playing;
  if ('menu' in flow && flow.menu) return 'menu';
  if (flow.mode === 'foot') return foot?.standing.kind === 'dead' ? 'dead' : 'foot';
  if (sea?.boarding.onDeck) return sea.boarding.foot?.standing.kind === 'dead' ? 'dead' : 'foot';
  if (sea?.aboard.walking) return 'foot';
  return sea?.fight ? 'fight' : 'helm';
}

/** Hears the keys and the pad's presses for what `game` does with them. */
export function listenForControls(game: Controlled): void {
  const { playing, input, ui, hud, story, change } = game;
  /** What the controls `pressed` do here, Escape among them for a key: the helm's map first, a struck deck's asks, a
   *  retry once a travel failed, the menu, then the sea's and the foot's own. */
  const act = (pressed: (id: BindId) => boolean, escape: boolean) => {
    const here = contextOf(playing);
    const acts = (id: BindId) => pressed(id) && CONTROLS[id].where.includes(here);
    const { flow, sea } = playing;
    const sailing = flow.mode === 'sea' && !flow.menu;
    const retry = game.retry();
    if (playing.helmMap.key(escape ? 'escape' : acts('confirm') ? 'enter' : acts('landMap') ? 'n' : '')) return;
    if (deckKey(acts, escape, sailing ? sea : null, game.respawn)) return;
    if ((pressed('confirm') || pressed('respawn')) && retry) retry();
    else if (acts('menu')) change({ kind: 'menu' });
    else if (escape && flow.mode === 'landing') {
      sea?.view.backToSea();
      change({ kind: 'back' });
    } else if (escape) change({ kind: 'back' });
    else if (acts('confirm') && sailing && sea?.chaseChosen()) return;
    else if (acts('ashore') || (acts('confirm') && sailing)) game.goAshore();
    else if (acts('voyage') && flow.mode === 'sea') game.stopOrResume();
    else if (acts('map') || acts('landMap')) game.openMap();
    else if (acts('manage')) game.manage();
    else if (acts('leaveHelm')) game.leaveHelm();
    // The repair is the helm's, and its key repairs walking the ship's own deck too, where the Arts are not cast.
    else if (
      pressed('repair') &&
      flow.mode === 'sea' &&
      sea?.aboard.active &&
      (here === 'helm' || (here === 'foot' && sea.aboard.walking))
    )
      sea.sighted?.ask('repair');
    else if (acts('use') && flow.mode === 'sea' && sea?.fight && fightAsk(sea) === 'board') input.lock();
    else if (acts('use') && sea?.aboard.walking) game.takeHelm();
    else if (acts('use') && flow.mode === 'foot' && !flow.menu && playing.through) game.goThrough();
    else if (acts('use') && flow.mode === 'foot') playing.foot?.use();
    else if (acts('confirm') && flow.mode === 'landing' && flow.chosen) game.landAt(flow.chosen);
    else if (acts('respawn') && flow.mode === 'foot') game.respawn();
    else if ((acts('slower') || acts('faster')) && flow.mode === 'sea') sea?.stepPace(acts('faster') ? 1 : -1);
  };
  addEventListener('keydown', (event) => {
    const key = keyNameOf(event);
    if (event.repeat || ui.typing) return;
    if (playing.flow.mode === 'story') return void story?.key(key, true);
    act((id) => BINDS.now[id].keys.includes(key), key === 'escape');
  });
  // The pad's presses do as the keys do, but under the gear screen or the sheet, whose buttons they are; B is
  // Escape in the game's menu, at the helm's map and at a landing; in the story A is a tap. Start and View open and shut the
  // menu and the sheet wherever their keys would.
  input.onPad((pressed, buttons) => {
    // A button being bound in the sheet is the sheet's alone.
    if (hud.controls.rebinding.slot) return;
    const covered = gearScreenOpen() || hud.controls.open;
    const escape = buttons.has('B') && (playing.helmMap.busy || playing.flow.mode === 'landing');
    // B steps out of the game's menu, as Escape does.
    if (buttons.has('B') && !covered && contextOf(playing) === 'menu') return change({ kind: 'back' });
    if (playing.flow.mode === 'story' && (pressed.has('jump') || pressed.has('confirm'))) story?.press();
    else if (playing.flow.mode !== 'story' && !covered) act((id) => !escape && pressed.has(id), escape);
    if (pressed.has('character') && playing.flow.mode !== 'story' && !hud.controls.open)
      openGearWindow({ view: 'character', toggle: true });
    if (pressed.has('controls') && (hud.controls.open || hud.keysOffered) && !gearScreenOpen()) {
      hud.controls.toggle();
      if (hud.controls.open) document.exitPointerLock();
    }
  });
}
