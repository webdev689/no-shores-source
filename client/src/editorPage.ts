import { FleetBerth, fleetRulesAt } from './combat/fleetBerth.ts';
import { offerFleet, offerPlates } from './editor/fleetLink.ts';
import { shipPlateNodes } from './game/shipPlates.ts';

// The World Editor's page. With `?room=` in its address its Sloop sails in a fleet room, reached through the network
// as the combat layer speaks it; the editor itself only draws her. The captains' plates over her and her foes are drawn as
// the game draws them.
offerFleet(FleetBerth.fromPage(location.search, () => fleetRulesAt(import.meta.env.BASE_URL)));
offerPlates(shipPlateNodes);
await import('./editor/editorMain.ts');
