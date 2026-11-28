import './keptNames.ts';
import { FleetBerth, fleetRulesAt } from './combat/fleetBerth.ts';
import { SeaFightReadout } from './combat/seaReadout.ts';
import { offerFleet, offerPlates, offerReadout } from './editor/fleetLink.ts';
import { offerIslePlants } from './editor/isleEditor.ts';
import { IslesNature } from './game/isleNature.ts';
import { capFace } from './game/hudParts.ts';
import { shipPlateNodes } from './game/shipPlates.ts';

// The World Editor's page. With `?room=` in its address its Sloop sails in a fleet room, reached through the network
// as the combat layer speaks it; the editor itself only draws it. The captains' plates over it and its foes are drawn
// as the game draws them, and so is a captain's fight's readout.
offerFleet(FleetBerth.fromPage(location.search, () => fleetRulesAt(import.meta.env.BASE_URL)));
offerPlates(shipPlateNodes);
offerReadout(new SeaFightReadout(capFace));
// `?islePlants=game`: the Islands mode draws an island's plants as the game does, for its pictures.
if (new URLSearchParams(location.search).get('islePlants') === 'game') offerIslePlants((gpu) => new IslesNature(gpu));
await import('./editor/editorMain.ts');
