// What the player's controls do outside the body's own moves (`player.ts`): the menus, the sea's asks, the helm's
// map, Use, Respawn, as a key or the pad presses them (the leave is held, and heard each frame: `leaveHold.ts`). Each
// acts only where its control does (`binds.ts`), so a key bound at the helm and on foot alike does each in its place.
// The story hears its keys itself. While a line of the dialogue box waits for a press, Continue's key or button is the
// line's alone: the frame moves it on (`gameFrame.ts`), and nothing here acts on it.
import { type BindId, CONTROLS, type Context } from '../player/binds.ts';
import { type Action, BINDS, type Input, type InputFrame, keyNameOf } from '../player/input.ts';
import type { DrawnInterface } from './drawnInterface.ts';
import { DUNGEON_MAP } from './dungeonMap/dungeonMap.ts';
import type { Flow, Happening } from './flow.ts';
import type { Playing } from './gameFrame.ts';
import { openGearWindow } from './gearScreen.ts';
import { gearScreenOpen } from './gearWindow.ts';
import { letGo, placingNow } from './guild/decorPlacing.ts';
import type { Hud } from './hud.ts';
import type { SeaLandings } from './seaLandings.ts';
import type { StoryHost } from './prologue/host.ts';
import { deckKey, fightAsk } from './seaWord.ts';
import { chatOpen, openChat, socialUp } from './social/social.ts';
import { continueDialogue, dialogueWaits } from '../speech/dialogue.ts';

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
  /** The sea's landings: the confirmation answered, and the landing the sea offers asked after. */
  readonly landings: SeaLandings;
  readonly stopOrResume: () => void;
  readonly openMap: () => void;
  readonly manage: () => void;
  readonly leaveHelm: () => void;
  readonly takeHelm: () => void;
  readonly goThrough: () => void;
  /** Does what the island's panel's chosen entry does (`islandPanel.ts`), its first's with none chosen. */
  readonly landAt: (id: string | null) => void;
  /** Closes a panel standing in the island's tiles' place (an Outposts tile's slots); whether one stood. */
  readonly islandBack: () => boolean;
}

/** Where the player's controls act now: in a window, dead (past the edge, or fallen in a fight), at the helm, in a
 *  fight at sea, or on foot (on land, or walking a deck). */
export function contextOf(playing: Pick<Playing, 'flow' | 'sea' | 'foot'>): Context {
  const { flow, sea, foot } = playing;
  const down = (here: Pick<NonNullable<Playing['foot']>, 'standing' | 'fell'> | null | undefined) =>
    here?.standing.kind === 'dead' || !!here?.fell;
  if (socialUp()) return 'menu';
  // Fallen in a fight or past the edge alike, the dead's controls act (Follow among them, where it is read).
  if (flow.mode === 'foot') return down(foot) ? 'dead' : 'foot';
  if (sea?.boarding.onDeck) return down(sea.boarding.foot) ? 'dead' : 'foot';
  if (sea?.aboard.walking) return 'foot';
  return sea?.fight ? 'fight' : 'helm';
}

/** Whether the interface takes the keys and the pad this frame: under a window (the menu, the creation, the chat) or
 *  over the island's tiles, which the arrows, Tab and the pad's cross walk and Enter and A press; never while a
 *  control waits to be bound, but the sheet's, which waits for it itself. */
export function interfaceKeys(
  mode: Flow['mode'],
  over: { readonly window: boolean; readonly binding: boolean; readonly sheet: boolean },
): boolean {
  return ((over.window || mode === 'landing') && !over.binding) || over.sheet;
}

/** What the pad's B pressed as it let go of a piece being placed, taken from the next frame's controls. */
let taken: ReadonlySet<Action> = new Set();

/** The frame's controls without the presses the pad's B made as it let go of a piece: the letting go takes the press,
 *  so the player does not dodge as well. */
export function withoutTaken(frame: InputFrame): InputFrame {
  const took = taken;
  if (took.size === 0) return frame;
  taken = new Set();
  return { ...frame, pressed: (action) => !took.has(action) && frame.pressed(action) };
}

/** A click on the view while a line of the dialogue box waits (`locked`, whether the pointer is the game's): a free
 *  pointer's moves the line on, where the left button is bound to Continue, and does nothing else; true where the
 *  click is the line's. A locked pointer's click is heard in the frame, as any button's press is. */
export function clickedOnLine(locked: boolean): boolean {
  if (locked || !dialogueWaits()) return false;
  if (BINDS.now.continue.keys.includes('mouse0')) continueDialogue();
  return true;
}

/** Hears the keys and the pad's presses for what `game` does with them. */
export function listenForControls(game: Controlled): void {
  const { playing, input, ui, hud, story, change } = game;
  /** Whether a window or the chat stands over the game. */
  const overGame = () => gearScreenOpen() || socialUp() || chatOpen();
  /** What the controls `pressed` do here, Escape among them for a key: the helm's map first, a struck deck's asks, a
   *  retry once a travel failed, the chat, then the sea's and the foot's own. */
  const act = (pressed: (id: BindId) => boolean, escape: boolean) => {
    const here = contextOf(playing);
    const acts = (id: BindId) => pressed(id) && CONTROLS[id].where.includes(here);
    const { flow, sea } = playing;
    const sailing = flow.mode === 'sea';
    const retry = game.retry();
    // No key breaks a travel's fade: the player has the ship again once it has arrived.
    if (sea?.travelling) return;
    // The legend's key is the map's wherever it is up, at the helm too, where the map takes every key; Set sail first.
    const mapKey = escape
      ? 'escape'
      : acts('confirm')
        ? 'enter'
        : pressed('legend')
          ? 'legend'
          : acts('landMap')
            ? 'n'
            : '';
    if (playing.helmMap.key(mapKey)) return;
    if (deckKey(acts, escape, sailing ? sea : null, game.respawn)) return;
    // A landing's confirmation standing at sea is answered first: Enter yes, Escape no.
    if (sailing && game.landings.asking && (escape || acts('confirm'))) return game.landings.answer(!escape);
    // A piece of decoration being placed is let go first, and nothing opens.
    if (escape && placingNow() && !overGame()) return letGo();
    if ((pressed('confirm') || pressed('respawn')) && retry) retry();
    else if (acts('chat') && !gearScreenOpen() && !socialUp()) openChat();
    else if (escape && flow.mode === 'landing' && game.islandBack()) return;
    else if (escape && flow.mode === 'landing') {
      sea?.view.backToSea();
      change({ kind: 'back' });
      // With nothing else over the game, on foot or at sea, Escape opens Settings, as other games' own menus open on
      // it.
    } else if (escape && (flow.mode === 'foot' || flow.mode === 'sea') && !playing.helmMap.busy && !overGame())
      openGearWindow({ view: 'settings' });
    else if (acts('confirm') && sailing && sea?.chaseChosen()) return;
    // Enter, or the pad's A, asks after the landing the sea offers where the ship lies, as L does.
    else if (acts('ashore') || (acts('confirm') && sailing)) game.landings.askHere();
    else if (acts('voyage') && flow.mode === 'sea') game.stopOrResume();
    else if (acts('map') || acts('landMap')) game.openMap();
    // Manage and Leave the helm are the Sealevel view's, as its console offers them.
    else if (acts('manage') && sea?.level === 'sealevel') game.manage();
    else if (acts('leaveHelm') && sea?.level === 'sealevel') game.leaveHelm();
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
    // Over the island's tiles, as no window above them hears it; a tile the keys or the pad focused is pressed by the
    // interface itself, so Enter acts once.
    else if (acts('confirm') && flow.mode === 'landing' && !overGame() && !ui.focused) game.landAt(flow.chosen);
    else if (acts('respawn') && flow.mode === 'foot') game.respawn();
    else if (acts('seaView') && flow.mode === 'sea') sea?.switchLevel();
  };
  addEventListener('keydown', (event) => {
    const key = keyNameOf(event);
    if (ui.typing) return;
    // The dungeon's map, while it is up, takes every key: its own, and the land map's or Escape to shut it. A key held
    // goes on turning or panning it, but never shuts it again.
    if (DUNGEON_MAP.key(key, event.repeat ? [] : BINDS.now.landMap.keys)) return;
    if (event.repeat) return;
    const continues = BINDS.now.continue.keys.includes(key);
    if (continues && dialogueWaits()) return;
    if (playing.flow.mode === 'story') return void story?.key(key, true);
    // While the stranger speaks her welcome under Auto, Continue moves her words on; no other game key acts but Escape.
    const welcome = playing.after.holding;
    if (welcome && continues) return void playing.after.press();
    act((id) => !welcome && BINDS.now[id].keys.includes(key), key === 'escape');
  });
  // The pad's presses do as the keys do, but under the gear screen or the sheet, whose buttons they are. B is Escape at
  // the helm's map, at a landing, at a landing's confirmation and while a piece of decoration is placed; in the story
  // A is a tap, and while she speaks Continue moves her words on. Start and View open and shut the menu and the sheet
  // wherever their keys would.
  input.onPad((pressed, buttons) => {
    // A button being bound in the sheet is the sheet's alone.
    if (hud.controls.rebinding.slot) return;
    const waits = dialogueWaits() && pressed.has('continue');
    const welcome = playing.after.holding;
    if (welcome && !waits && pressed.has('continue')) playing.after.press();
    const covered = gearScreenOpen() || hud.controls.open || socialUp() || chatOpen();
    const asking = playing.flow.mode === 'sea' && !!game.landings.asking;
    const escape =
      buttons.has('B') && (playing.helmMap.busy || playing.flow.mode === 'landing' || !!placingNow() || asking);
    if (escape && placingNow()) taken = new Set([...pressed].filter((id) => BINDS.now[id].pad.includes('B')));
    // A waiting line's press is the line's: the frame moves it on.
    if (waits) return;
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
