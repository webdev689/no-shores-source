// The Enhanced Plus kit: every surface plays a role, and the role, not the surface, says how it is painted and how it
// answers a press, so every surface reads as the one carved stone. It writes paint only, never a width, padding or
// size, so dressing a surface never moves it: the surface's own sheet gives it its room, and a window or a press its
// 2 px border, on which the frame and the bevels land.
import { frameImage, OUTSET } from './frame.ts';
import { BEVELS, TONES } from './tones.ts';

/** Each role's class: a surface takes its role by taking the class. */
export const ROLES = {
  /** A whole surface over the world: the carved frame and its brass fittings, a solid ground, a hard drop. */
  window: 'plus-window',
  /** A box inside a window: a stone bevel and an engraved inner line. */
  panel: 'plus-panel',
  /** Something pressed: raised, brass under the pointer, sunk while held, flat when it cannot be pressed. */
  button: 'plus-button',
  /** The one press a surface is for: the button, in brass. */
  primary: 'plus-primary',
  /** A press that costs something: the button's edge in blood rather than brass. */
  warn: 'plus-warn',
  /** A pickable cell in a dense grid: the button without its drop, so a grid does not turn to noise. */
  tile: 'plus-tile',
  /** A readout, never pressed. */
  chip: 'plus-chip',
  /** Something sunk into the surface: a meter, an input. */
  well: 'plus-well',
  /** The band that names a window: a lit ground over a groove. */
  header: 'plus-header',
  /** The band a window's actions stand on: a groove above. */
  footer: 'plus-footer',
  /** A row's underline, engraved rather than printed. */
  rule: 'plus-rule',
  /** An upright between two parts of a surface, engraved as a rule is. */
  rail: 'plus-rail',
} as const;

export type Role = keyof typeof ROLES;

/** The id of the kit's sheet in a page. */
const KIT_STYLE_ID = 'plus-kit';

/** The stone grain every window ground carries: a 4 px checker at 2%. */
const GRAIN = 'repeating-conic-gradient(rgba(255,255,255,0.022) 0 25%, transparent 0 50%) 0 0 / 4px 4px';
const RING = `0 0 0 1px ${TONES.outline}`;
/** A press's lit top band and shaded foot. */
const LIT_BAND =
  'linear-gradient(180deg, rgba(255,255,255,0.08) 0 2px, transparent 2px calc(100% - 3px), rgba(0,0,0,0.32) calc(100% - 3px))';

const role = (name: Role, state = '') => `.${ROLES[name]}${state}`;
const pressable = (state = '') => `${role('button', state)}, ${role('primary', state)}`;

/** The kit's sheet. */
export function kitCss(): string {
  const { warn, primary, button, tile } = ROLES;
  return `
${role('window')} {
  border-image: ${frameImage()};
  background: ${GRAIN}, ${TONES.ground};
  box-shadow: 4px 4px 0 ${OUTSET}px rgba(0,0,0,0.42);
  color: ${TONES.word}; }

${role('panel')} {
  border-color: ${BEVELS.raised};
  background-color: ${TONES.groundPanel};
  box-shadow: ${RING}, inset 0 0 0 1px rgba(5,6,8,0.75), inset 0 3px 0 -1px rgba(255,255,255,0.04),
    3px 3px 0 1px rgba(0,0,0,0.4); }

${pressable()} {
  border-color: ${BEVELS.raised};
  background-color: ${TONES.groundButton}; background-image: ${LIT_BAND};
  box-shadow: ${RING}, 2px 2px 0 1px rgba(0,0,0,0.45);
  color: ${TONES.word}; transition: none; }
${role('primary')} { border-color: ${BEVELS.brass}; background-color: #2a2217; }
${pressable(':hover')}, ${pressable(':focus-visible')}, .${button}.on {
  border-color: ${BEVELS.brass}; background-color: ${TONES.groundButtonHi}; background-image: ${LIT_BAND}; }
.${primary}:hover, .${primary}:focus-visible { background-color: #3a2e1c; }
.${warn} { border-color: ${BEVELS.blood}; background-color: #241514; background-image: ${LIT_BAND}; color: #f4dfd8; }
.${warn}:hover:not(:disabled), .${warn}:focus-visible {
  border-color: ${BEVELS.bloodHi}; background-color: #321b19; background-image: ${LIT_BAND}; color: #fff3ee; }
${pressable(':active:not(:disabled)')} {
  border-color: ${BEVELS.sunk}; translate: 1px 1px;
  box-shadow: ${RING}, inset 2px 2px 0 rgba(0,0,0,0.5); }
.${warn}:active:not(:disabled) { border-color: ${BEVELS.bloodSunk}; }
${pressable(':disabled')}, ${pressable('[disabled]')} {
  border-color: rgba(125,116,96,0.3); background-color: rgba(12,14,18,0.6); background-image: none;
  box-shadow: 0 0 0 1px rgba(5,6,8,0.6); color: ${TONES.wordDim}; translate: none; }

.${tile} {
  border-color: ${BEVELS.raisedSoft};
  background-image: linear-gradient(180deg, rgba(255,255,255,0.06) 0 2px, transparent 2px);
  box-shadow: ${RING}; transition: none; }
.${tile}:hover, .${tile}:focus-visible, .${tile}.on { border-color: ${BEVELS.brass}; }
.${tile}:active { border-color: ${BEVELS.sunk}; }

${role('chip')} {
  border-color: ${BEVELS.raisedSoft}; background-color: ${TONES.groundChip};
  box-shadow: ${RING}, 2px 2px 0 1px rgba(0,0,0,0.35); }

${role('well')} { border-color: ${BEVELS.sunk}; box-shadow: ${RING}, inset 2px 2px 0 rgba(0,0,0,0.5); }

${role('header')} {
  border-bottom-color: ${TONES.outline};
  background-image: linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015));
  box-shadow: 0 1px 0 ${TONES.groove}, inset 0 1px 0 rgba(255,255,255,0.05); }

${role('footer')} {
  border-top-color: ${TONES.outline};
  background-image: linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.2));
  box-shadow: inset 0 1px 0 ${TONES.groove}; }

${role('rule')} { border-bottom-color: rgba(5,6,8,0.6); box-shadow: 0 1px 0 rgba(163,152,128,0.13); }
${role('rail')} { border-left-color: rgba(5,6,8,0.75); box-shadow: inset 1px 0 0 rgba(163,152,128,0.13); }

@media (prefers-reduced-motion: reduce) {
  ${pressable(':active:not(:disabled)')} { translate: none; }
}
`;
}

/** Lays the kit's sheet into `page` once; a second call leaves it as it is. */
export function wearKit(page: Document): void {
  if (page.getElementById(KIT_STYLE_ID)) return;
  const sheet = page.createElement('style');
  sheet.id = KIT_STYLE_ID;
  sheet.textContent = kitCss();
  page.head.append(sheet);
}
