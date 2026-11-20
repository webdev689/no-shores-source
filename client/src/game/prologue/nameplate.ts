// A boss's nameplate as the camera finds them: their faction's emblem, their name large across the view, the faction
// under it, and a rule of iron red between, struck in and held while they cry out, then gone.
import { make } from '../../editor/dom.ts';
import { emblemUrl } from '../../plus/emblems.ts';
import { motionReduced } from '../../plus/kit.ts';

const STYLE_ID = 'story-nameplate';
const CSS = `
.story-nameplate { position: absolute; left: 0; right: 0; top: 58%; text-align: center; pointer-events: none;
  opacity: 0; transition: opacity 0.35s; z-index: 26; }
.story-nameplate.shown { opacity: 1; }
.story-nameplate img { width: 55px; height: 55px; image-rendering: pixelated; display: block; margin: 0 auto 11px; }
.story-nameplate-name { font-size: 66px; line-height: 1; letter-spacing: round(up, calc(4em / 22), 1px);
  text-transform: uppercase; color: #f0e4c4;
  text-shadow: 0 4px 0 #2a0404, 0 0 22px rgba(120, 10, 4, 0.75), 0 0 6px #000; }
.story-nameplate-rule { width: 660px; max-width: 80vw; height: 4px; margin: 14px auto 11px;
  background: linear-gradient(90deg, transparent, #6b1208 15%, #c8341c 50%, #6b1208 85%, transparent);
  transform: scaleX(0); transition: transform 0.7s cubic-bezier(.2,.9,.2,1) 0.15s; }
.story-nameplate.shown .story-nameplate-rule { transform: none; }
.story-nameplate-faction { font-size: 22px; letter-spacing: round(up, calc(6em / 22), 1px); text-transform: uppercase;
  color: #b9a37a; text-shadow: 0 2px 0 #000; }
.story-nameplate.struck .story-nameplate-name { animation: story-strike 0.5s cubic-bezier(.2,.9,.2,1); }
@keyframes story-strike { 0% { transform: scale(1.6); opacity: 0; } 60% { transform: scale(0.97); opacity: 1; } 100% { transform: none; } }
@media (max-width: 900px) { .story-nameplate-name { font-size: 44px; } }
`;

export class Nameplate {
  private readonly plate: HTMLElement;
  private readonly emblem: HTMLImageElement;
  private readonly name: HTMLElement;
  private readonly faction: HTMLElement;

  constructor(root: HTMLElement) {
    const page = root.ownerDocument;
    if (!page.getElementById(STYLE_ID)) {
      const sheet = page.createElement('style');
      sheet.id = STYLE_ID;
      sheet.textContent = CSS;
      page.head.append(sheet);
    }
    this.plate = make('div', '', 'story-nameplate');
    this.emblem = page.createElement('img');
    this.emblem.alt = '';
    this.name = make('div', '', 'story-nameplate-name');
    this.faction = make('div', '', 'story-nameplate-faction');
    this.plate.append(this.emblem, this.name, make('div', '', 'story-nameplate-rule'), this.faction);
    this.plate.setAttribute('role', 'status');
    root.append(this.plate);
  }

  /** Strikes the plate in: the name, its faction by number and name. */
  show(name: string, faction: number, factionName: string): void {
    const url = emblemUrl(faction);
    this.emblem.hidden = !url;
    if (url) this.emblem.src = url;
    this.name.textContent = name;
    this.faction.textContent = factionName;
    this.plate.classList.toggle('struck', !motionReduced());
    this.plate.classList.add('shown');
  }

  hide(): void {
    this.plate.classList.remove('shown', 'struck');
  }

  remove(): void {
    this.plate.remove();
  }
}
