// The speech layer's own sheet, laid once on whichever page speaks. The Enhanced Plus kit paints the dialogue box as a
// window and its name band as a header; this sheet gives each its room, and never a colour to a border the kit paints.
// It lands after the kit's, so it sets a border's width and style alone: the `border` shorthand would also clear the
// kit's frame picture.
import { wearKit } from '../plus/kit.ts';
import { HALO, TONES } from '../plus/tones.ts';

const SHEET_ID = 'speech';
/** The fight's vitals take the bottom left up to 354 px across, so the box keeps to the middle, clear of them on both
 *  sides, and stands over the sea bar at the screen's foot. It stands over the marks above heads, as a speaker's head
 *  can be behind it. */
const CLEAR_OF_VITALS_PX = 380;
const BOX_WIDTH_PX = 660;
const BOX_FOOT_PX = 104;

export function speechCss(): string {
  return `
.speech-box[hidden], .speech-nowhere[hidden], .speech-overheads [hidden] { display: none; }
.speech-box {
  position: absolute; left: 50%; bottom: ${BOX_FOOT_PX}px; transform: translateX(-50%);
  width: min(${BOX_WIDTH_PX}px, calc(100vw - ${2 * CLEAR_OF_VITALS_PX}px)); min-width: 330px; box-sizing: border-box;
  border-width: 2px; border-style: solid; pointer-events: none; z-index: 1; }
.speech-name {
  font-size: 22px; line-height: 33px; padding: 4px 22px 2px; color: ${TONES.brassHi};
  border-bottom-width: 1px; border-bottom-style: solid; text-shadow: 1px 1px 0 ${TONES.outline}; }
.speech-words {
  margin: 0; padding: 11px 22px 15px; min-height: 66px;
  font-size: 22px; line-height: 33px; text-shadow: 1px 1px 0 ${TONES.outline}; }
.speech-unseen { visibility: hidden; }
.speech-nowhere {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); margin: 0;
  width: ${BOX_WIDTH_PX}px; max-width: calc(100vw - 44px); text-align: center; pointer-events: none;
  font-size: 22px; line-height: 33px; color: ${TONES.wordDim}; opacity: 0.7; text-shadow: ${HALO}; }
.speech-overheads { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.speech-bark, .speech-emote { position: absolute; left: 0; top: 0; }
.speech-bark { margin: 0; white-space: nowrap; font-size: 22px; line-height: 22px; color: ${TONES.word}; text-shadow: ${HALO}; }
.speech-emote { image-rendering: pixelated; }
`;
}

/** Lays the kit's sheet and the speech sheet into `page` once. */
export function wearSpeech(page: Document): void {
  wearKit(page);
  if (page.getElementById(SHEET_ID)) return;
  const sheet = page.createElement('style');
  sheet.id = SHEET_ID;
  sheet.textContent = speechCss();
  page.head.append(sheet);
}
