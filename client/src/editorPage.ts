import { FleetBerth, fleetRulesAt } from './combat/fleetBerth.ts';
import { offerFleet } from './editor/fleetLink.ts';

// The World Editor's page. With `?room=` in its address its Sloop sails in a fleet room, reached through the network
// as the combat layer speaks it; the editor itself only draws her.
offerFleet(FleetBerth.fromPage(location.search, () => fleetRulesAt(import.meta.env.BASE_URL)));
await import('./editor/editorMain.ts');
