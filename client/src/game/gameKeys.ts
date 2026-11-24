// What the player's controls do outside the body's own moves (`player.ts`): the menus, the sea's asks, the helm's
// map, Use, Respawn, as a key or the pad presses them (the leave is held, and heard each frame: `leaveHold.ts`). Each
// acts only where its control does (`binds.ts`), so a key bound at the helm and on foot alike does each in its place.
// The story hears its keys itself.
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
import { chatOpen, openChat, socialUp } from './social/social.ts';

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

/** Where the player's controls act now: in a window, dead (past the edge, or fallen in a fight), at the helm, in a fight
 *  at sea, or on foot (on land, or walking a deck). */
export function contextOf(playing: Pick<Playing, 'flow' | 'sea' | 'foot'>): Context {
  const { flow, sea, foot } = playing;
  const down = (here: Pick<NonNullable<Playing['foot']>, 'standing' | 'fell'> | null | undefined) =>
    here?.standing.kind === 'dead' || !!here?.fell;
  if (socialUp()) return 'menu';
  if (flow.mode === 'foot') return down(foot) ? 'dead' : 'foot';
  if (sea?.boarding.onDeck) return down(sea.boarding.foot) ? 'dead' : 'foot';
  if (sea?.aboard.walking) return 'foot';
  return sea?.fight ? 'fight' : 'helm';
}

/** Hears the keys and the pad's presses for what `game` does with them. */
export function listenForControls(game: Controlled): void {
  const { playing, input, ui, hud, story, change } = game;
  /** What the controls `pressed` do here, Escape among them for a key: the helm's map first, a struck deck's asks, a
   *  retry once a travel failed, the chat, then the sea's and the foot's own. */
  /** Whether a window or the chat stands over the game. */
  const overGame = () => gearScreenOpen() || socialUp() || chatOpen();
  const act = (pressed: (id: BindId) => boolean, escape: boolean) => {
    const here = contextOf(playing);
    const acts = (id: BindId) => pressed(id) && CONTROLS[id].where.includes(here);
    const { flow, sea } = playing;
    const sailing = flow.mode === 'sea';
    const retry = game.retry();
    // No key breaks a travel's cinematic: the player has the ship again once it has arrived.
    if (sea?.travelling) return;
    if (playing.helmMap.key(escape ? 'escape' : acts('confirm') ? 'enter' : acts('landMap') ? 'n' : '')) return;
    if (deckKey(acts, escape, sailing ? sea : null, game.respawn)) return;
    if ((pressed('confirm') || pressed('respawn')) && retry) retry();
    else if (acts('chat') && !gearScreenOpen() && !socialUp()) openChat();
    else if (escape && flow.mode === 'landing') {
      sea?.view.backToSea();
      change({ kind: 'back' });
      // With nothing else over the game, on foot or at sea, Escape opens Settings, as other games' own menus open on it.
    } else if (escape && (flow.mode === 'foot' || flow.mode === 'sea') && !playing.helmMap.busy && !overGame())
      openGearWindow({ view: 'settings' });
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
    else if (acts('use') && flow.mode === 'foot' && playing.through) game.goThrough();
    else if (acts('use') && flow.mode === 'foot') playing.foot?.use();
    else if (acts('confirm') && flow.mode === 'landing' && flow.chosen) game.landAt(flow.chosen);
    else if (acts('respawn') && flow.mode === 'foot') game.respawn();
    else if ((acts('slower') || acts('faster')) && flow.mode === 'sea') sea?.stepPace(acts('faster') ? 1 : -1);
  };
  addEventListener('keydown', (event) => {
    const key = keyNameOf(event);
    if (event.repeat || ui.typing) return;
    if (playing.flow.mode === 'story') return void story?.key(key, true);
    // While the stranger speaks her welcome Space moves her words on, as in the story's cutscenes; no other game key
    // acts but Escape.
    const welcome = playing.after.holding;
    if (welcome && BINDS.now.jump.keys.includes(key)) return void playing.after.press();
    act((id) => !welcome && BINDS.now[id].keys.includes(key), key === 'escape');
  });
  // The pad's presses do as the keys do, but under the gear screen or the sheet, whose buttons they are; B is
  // Escape at the helm's map and at a landing; in the story, and while she speaks, A is a tap. Start and View open and
  // shut the menu and the sheet wherever their keys would.
  input.onPad((pressed, buttons) => {
    // A button being bound in the sheet is the sheet's alone.
    if (hud.controls.rebinding.slot) return;
    const welcome = playing.after.holding;
    if (welcome && (pressed.has('jump') || pressed.has('confirm'))) playing.after.press();
    const covered = gearScreenOpen() || hud.controls.open || socialUp() || chatOpen();
    const escape = buttons.has('B') && (playing.helmMap.busy || playing.flow.mode === 'landing');
    if (playing.flow.mode === 'story' && (pressed.has('jump') || pressed.has('confirm'))) story?.press();
    else if (playing.flow.mode !== 'story' && !covered)
      act((id) => !escape && !welcome && pressed.has(id), escape && !welcome);
    // As the key does, in the story too: the menu itself refuses where the story keeps no gear.
    if (pressed.has('character') && !hud.controls.open && !playing.sea?.travelling)
      openGearWindow({ view: 'character', toggle: true });
    if (pressed.has('controls') && (hud.controls.open || hud.keysOffered) && !gearScreenOpen()) {
      hud.controls.toggle();
      if (hud.controls.open) document.exitPointerLock();
    }
  });
}
