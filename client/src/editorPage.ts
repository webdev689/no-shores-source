import './keptNames.ts';
import { FleetBerth, fleetRulesAt } from './combat/fleetBerth.ts';
import { SeaFightReadout } from './combat/seaReadout.ts';
import { offerFleet, offerPlates, offerReadout } from './editor/fleetLink.ts';
import { capFace } from './game/hudParts.ts';
import { shipPlateNodes } from './game/shipPlates.ts';

// The World Editor's page. With `?room=` in its address its Sloop sails in a fleet room, reached through the network
// as the combat layer speaks it; the editor itself only draws it. The captains' plates over it and its foes are drawn as
// the game draws them, and so is a captain's fight's readout.
offerFleet(FleetBerth.fromPage(location.search, () => fleetRulesAt(import.meta.env.BASE_URL)));
offerPlates(shipPlateNodes);
offerReadout(new SeaFightReadout(capFace));
await import('./editor/editorMain.ts');
