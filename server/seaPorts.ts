// The ports the sea room is opened with, so the Grey Tithe patrols the lanes between the port cities: each
// continent's city, read from its land file as the page reads it (`client/src/game/worldData.ts`); and the islands'
// names, so the sea of every island not yet named is locked.
import one from '../content/world/land/continent-1.json' with { type: 'json' };
import two from '../content/world/land/continent-2.json' with { type: 'json' };
import three from '../content/world/land/continent-3.json' with { type: 'json' };
import four from '../content/world/land/continent-4.json' with { type: 'json' };
import five from '../content/world/land/continent-5.json' with { type: 'json' };
import six from '../content/world/land/continent-6.json' with { type: 'json' };
import seven from '../content/world/land/continent-7.json' with { type: 'json' };
import eight from '../content/world/land/continent-8.json' with { type: 'json' };
import nine from '../content/world/land/continent-9.json' with { type: 'json' };
import islands from '../content/world/islands.json' with { type: 'json' };
import layout from '../content/world/layout.json' with { type: 'json' };
import { portsOf, sitesOf } from '../client/src/game/worldData.ts';

const LANDS = [one, two, three, four, five, six, seven, eight, nine];

/** Every continent's city as a port, in the layout's order of continents. */
export const SEA_PORTS = portsOf(
  LANDS.flatMap((land, index) => sitesOf(`continent-${index + 1}`, JSON.stringify(land), []).city ?? []),
);

/** The living port cities' centres, by the rules' port cities' ids (`room_main_ports`, as JSON). */
export const livingPorts = (main: string) =>
  SEA_PORTS.filter((port) => (JSON.parse(main) as string[]).includes(port.id)).map((port) => port.centre);

/** The sea room's opening text: the layout, its ports and the islands' names (crates/room-wasm/src/lib.rs
 *  `SeaRequest`). */
export const SEA_REQUEST = JSON.stringify({ layout, ports: SEA_PORTS, islands });
