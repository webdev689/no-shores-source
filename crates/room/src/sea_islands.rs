//! The sea's procedural islands ([[Islands]]): rolled near players' ships in hostile waters, never in home waters, each
//! a place and a seed that every machine builds the same island from (`isle`). A ship within `FIND_M` finds one; one
//! is held while a ship is within `NEAR_M` of it or a player stands ashore on it, and fades `FADE_TICKS` after. A
//! standing island's coast, out past its shallows, is land to every course and to the hostile ships' chart.

use super::{Coast, Sailing, Sea};
use crate::PlayerId;
use crate::chart::Charted;
use isle::Kind;
use isle::draws::Draws;
use std::collections::{BTreeMap, BTreeSet};
use world::geometry::Point;
use world::waters::Holder;

/// How far off a player is told of an island, metres: as far as a ship is seen.
pub const SIGHT_M: f64 = 20_000.0;
/// How near a ship comes to an island to find it, metres: it is then marked on the held map while it stands.
pub const FIND_M: f64 = 2_000.0;
/// How near a ship holds an island, and how many it wants within that before more are rolled round it.
pub const NEAR_M: f64 = 8_000.0;
const WANTED_NEAR: usize = 2;
/// How often the sea rolls for islands round each ship, ticks, and the chance a roll that wants one makes one.
const ROLL_EVERY_TICKS: u64 = 600;
const ROLL_CHANCE: f64 = 0.3;
/// How far from the ship an island is rolled, metres, and how clear it stands of coasts, of other islands, and of
/// ships and their courses.
const ROLL_FROM_M: f64 = 3_000.0;
const ROLL_TO_M: f64 = 7_000.0;
const CLEAR_OF_COAST_M: f64 = 3_000.0;
const CLEAR_OF_ISLANDS_M: f64 = 3_000.0;
const CLEAR_OF_SHIPS_M: f64 = 1_200.0;
const CLEAR_OF_COURSES_M: f64 = 300.0;
/// How long an island stands once nothing holds it: ten minutes.
pub const FADE_TICKS: u64 = 10 * 60 * 60;
/// How long a word from its room that players stand ashore holds an island: two minutes, past its minute's ping.
pub const ASHORE_TICKS: u64 = 2 * 60 * 60;
/// The most islands the sea holds at once.
const MOST: usize = 96;
/// How far past its shallows' ring a ship keeps off an island's coast, metres.
const KEEP_OFF_M: f64 = 20.0;
/// How near its anchorage a ship at rest lies to land its account on an island: the page anchors within 30 m, and
/// 10 m more for its prediction.
pub const LANDING_M: f64 = 40.0;

/// An island at sea: its number, seed and kind, where its middle is, the continent whose water it lies in and that
/// continent's climate and resource (its place in the gear's catalogue), whose guards hold it, where a ship anchors
/// off it, its coast as land, and the tick it was last held.
#[derive(Debug)]
pub struct SeaIsland {
    pub id: u32,
    pub seed: u64,
    pub kind: Kind,
    pub at: [f64; 2],
    pub continent: usize,
    pub climate: String,
    pub resource: Option<u8>,
    pub guards: Option<u8>,
    /// Its water's band of levels, its guards' and its dungeon's.
    pub levels: Option<(u8, u8)>,
    pub anchorage: [f64; 2],
    pub(crate) coast: Coast,
    held_at: u64,
}

/// A ship as the islands see it: its player, where it is, and the course it sails.
type ShipAndCourse = (PlayerId, [f64; 2], Vec<[f64; 2]>);

/// Every island standing, the draws they are rolled from, and each player's found ones.
#[derive(Debug)]
pub struct Islands {
    pub(crate) standing: Vec<SeaIsland>,
    draws: Draws,
    next_id: u32,
    found: BTreeMap<PlayerId, BTreeSet<u32>>,
    /// Each continent's climate and resource, in the layout's order.
    climates: Vec<(String, Option<u8>)>,
    /// Each account landed on an island, by its number, and the landing's own number: its ship lay at rest at that
    /// island's anchorage when last at sea. Its island's room lets only those scavenge and gather, and a landing of a
    /// new number is a new visit, its nodes standing again for it. How many landings there have been.
    landed: BTreeMap<String, (u32, u32)>,
    landings: u32,
}

fn apart(one: [f64; 2], other: [f64; 2]) -> f64 {
    let (along_x, along_y) = (one[0] - other[0], one[1] - other[1]);
    (along_x * along_x + along_y * along_y).sqrt()
}

/// How far a point lies from a leg.
fn off_leg(point: [f64; 2], from: [f64; 2], to: [f64; 2]) -> f64 {
    let (along_x, along_y) = (to[0] - from[0], to[1] - from[1]);
    let length = along_x * along_x + along_y * along_y;
    let share = if length > 0.0 {
        (((point[0] - from[0]) * along_x + (point[1] - from[1]) * along_y) / length).clamp(0.0, 1.0)
    } else {
        0.0
    };
    apart(point, [from[0] + along_x * share, from[1] + along_y * share])
}

/// The room of the dungeon behind an island's door at Normal: its water's continent, its style (`isle::Kind::dungeon`)
/// and its seed folded to 32 bits in 8 hex digits (server/roomNames.ts `seaDungeonRoom`). The page names its door's
/// room so from the seed and water the sea told it (client/src/game/isleLaw.ts `dungeonRoomName`).
#[must_use]
pub fn dungeon_room(seed: u64, continent: &str) -> String {
    let folded = (seed ^ (seed >> 32)) as u32;
    format!("sea-dungeon-{continent}-{}-{folded:08x}", Kind::of(seed).dungeon())
}

/// Whose guards stand on an isle in a water: its holder's, a contested water's drawn by its seed; none at home.
fn guards_of(holder: Holder, seed: u64) -> Option<u8> {
    match holder {
        Holder::Home => None,
        Holder::GreyTithe => Some(::foes::factions::GREY_TITHE),
        Holder::Pirates => Some(::foes::factions::PIRATES),
        Holder::Contested if seed & 1 == 0 => Some(::foes::factions::GREY_TITHE),
        Holder::Contested => Some(::foes::factions::PIRATES),
    }
}

/// A continent's climate, and its resource's place in the gear's catalogue, which its water's islands carry.
pub(crate) fn climate_and_resource(continent: &world::layout::Continent) -> (String, Option<u8>) {
    let resources = &gear::catalogue::catalogue().resources;
    let resource = resources.iter().position(|found| found.continent == continent.id);
    (continent.climate.clone().unwrap_or_default(), resource.and_then(|place| u8::try_from(place).ok()))
}

impl Islands {
    /// No island yet, rolled from `seed`; `climates` each continent's climate and resource, in the layout's order.
    #[must_use]
    pub fn new(seed: u32, climates: Vec<(String, Option<u8>)>) -> Self {
        Islands {
            standing: Vec::new(),
            draws: Draws::of(u64::from(seed), 0x15_1a_4d),
            next_id: 1,
            found: BTreeMap::new(),
            landed: BTreeMap::new(),
            landings: 0,
            climates,
        }
    }

    /// The island built from `seed` with its middle at `at`, in the water `continent`'s, if the islands' contract
    /// dresses that continent's climate.
    fn island(&mut self, seed: u64, at: [f64; 2], water: (usize, Holder, Option<(u8, u8)>)) -> Option<SeaIsland> {
        let (continent, holder, levels) = water;
        let (climate, resource) = self.climates.get(continent)?.clone();
        isle::catalog::catalog().climates.get(&climate)?;
        let shape = isle::shape_of(seed);
        let ring = shape.ring(48, isle::sites::SHALLOWS_M + KEEP_OFF_M);
        let whole = |[x, y]: [f64; 2]| Point::new((at[0] + x).round() as i64, (at[1] + y).round() as i64);
        let coast = Coast::ring(ring.into_iter().map(whole).collect());
        let [x, y] = shape.anchorage();
        let id = self.next_id;
        self.next_id += 1;
        let (kind, guards) = (Kind::of(seed), guards_of(holder, seed));
        Some(SeaIsland {
            id,
            seed,
            kind,
            at,
            continent,
            climate,
            resource,
            guards,
            levels,
            anchorage: [at[0] + x, at[1] + y],
            coast,
            held_at: 0,
        })
    }

    /// Every standing island, in the order they were rolled.
    pub fn standing(&self) -> impl Iterator<Item = &SeaIsland> {
        self.standing.iter()
    }

    /// Each standing island's coast, as land.
    pub(crate) fn coasts(&self) -> impl Iterator<Item = &Coast> {
        self.standing.iter().map(|island| &island.coast)
    }

    /// The islands within `SIGHT_M` of a point, in the order they were rolled.
    pub fn sighted(&self, at: [f64; 2]) -> impl Iterator<Item = &SeaIsland> {
        self.standing.iter().filter(move |island| apart(island.at, at) <= SIGHT_M)
    }

    /// The islands a player at `at` is told of: those in sight, and those they have found, wherever they lie.
    pub fn told(&self, player: PlayerId, at: [f64; 2]) -> impl Iterator<Item = &SeaIsland> {
        self.standing.iter().filter(move |island| apart(island.at, at) <= SIGHT_M || self.found(player, island.id))
    }

    /// The number of an account's landing on the standing island `id` of `seed`, if it is landed there.
    #[must_use]
    pub fn landed(&self, id: u32, seed: u64, account: &str) -> Option<u32> {
        let (on, landing) = *self.landed.get(account)?;
        (on == id && self.by_id(id).is_some_and(|island| island.seed == seed)).then_some(landing)
    }

    /// Whether a player has found an island.
    #[must_use]
    pub fn found(&self, player: PlayerId, id: u32) -> bool {
        self.found.get(&player).is_some_and(|found| found.contains(&id))
    }

    /// The standing islands a player has found.
    pub fn found_by(&self, player: PlayerId) -> impl Iterator<Item = &SeaIsland> {
        self.standing.iter().filter(move |island| self.found(player, island.id))
    }

    /// The island by its number, if it stands.
    #[must_use]
    pub fn by_id(&self, id: u32) -> Option<&SeaIsland> {
        self.standing.iter().find(|island| island.id == id)
    }

    /// Holds an island while players stand ashore on it: its room's word, each minute.
    pub fn hold_ashore(&mut self, id: u32, seed: u64, clock: u64) -> bool {
        let Some(island) = self.standing.iter_mut().find(|island| island.id == id && island.seed == seed) else {
            return false;
        };
        island.held_at = island.held_at.max(clock + ASHORE_TICKS);
        true
    }

    pub fn forget(&mut self, player: PlayerId) {
        self.found.remove(&player);
    }

    /// One tick: each ship finds the islands within `FIND_M` and holds those within `NEAR_M`; an island held by none
    /// for `FADE_TICKS` fades; and every `ROLL_EVERY_TICKS` each ship short of islands near it may have one rolled.
    fn tick(&mut self, clock: u64, ships: &[ShipAndCourse], others: &[[f64; 2]], chart: (&Charted, &[Coast])) {
        for (player, at, _) in ships {
            for island in &mut self.standing {
                let off = apart(island.at, *at);
                if off <= NEAR_M {
                    island.held_at = island.held_at.max(clock);
                }
                if off <= FIND_M {
                    self.found.entry(*player).or_default().insert(island.id);
                }
            }
        }
        let standing = self.standing.len();
        self.standing.retain(|island| clock <= island.held_at + FADE_TICKS);
        if self.standing.len() < standing {
            for found in self.found.values_mut() {
                found.retain(|id| self.standing.iter().any(|island| island.id == *id));
            }
        }
        if !clock.is_multiple_of(ROLL_EVERY_TICKS) {
            return;
        }
        for (_, at, _) in ships {
            let near = self.standing.iter().filter(|island| apart(island.at, *at) <= NEAR_M).count();
            if near >= WANTED_NEAR || self.standing.len() >= MOST || self.draws.unit() >= ROLL_CHANCE {
                continue;
            }
            if let Some(mut island) = self.roll(*at, ships, others, chart) {
                island.held_at = clock;
                self.standing.push(island);
            }
        }
    }

    /// An island rolled round a ship at `at`, in the first of eight places drawn that is hostile open sea, clear of the
    /// coasts, the islands, every ship and pirate, and every course.
    fn roll(
        &mut self,
        at: [f64; 2],
        ships: &[ShipAndCourse],
        others: &[[f64; 2]],
        (charted, coasts): (&Charted, &[Coast]),
    ) -> Option<SeaIsland> {
        for _ in 0..8 {
            let bearing = self.draws.between(0.0, core::f64::consts::TAU);
            let off = self.draws.between(ROLL_FROM_M, ROLL_TO_M);
            let place = [at[0] + libm::sin(bearing) * off, at[1] - libm::cos(bearing) * off];
            let seed = self.draws.next_whole();
            let Some((water, levels)) = charted.water(place) else { continue };
            let Some(point) = super::whole(&place) else { continue };
            let reach = isle::reach_of(seed);
            let open = water.holder != Holder::Home
                && !super::on_land(coasts, point)
                && charted.clearance(place) >= CLEAR_OF_COAST_M
                && self.standing.iter().all(|island| apart(island.at, place) >= CLEAR_OF_ISLANDS_M)
                && others
                    .iter()
                    .chain(ships.iter().map(|(_, ship, _)| ship))
                    .all(|&ship| apart(ship, place) >= CLEAR_OF_SHIPS_M)
                && ships.iter().all(|(_, ship, course)| {
                    core::iter::once(ship)
                        .chain(course)
                        .zip(course)
                        .all(|(&from, &to)| off_leg(place, from, to) >= reach + CLEAR_OF_COURSES_M)
                });
            if open && let Some(island) = self.island(seed, place, (water.continent, water.holder, levels)) {
                return Some(island);
            }
        }
        None
    }
}

impl Sea {
    /// The sea's islands.
    #[must_use]
    pub fn islands(&self) -> &Islands {
        &self.islands
    }

    /// Holds an island while players stand ashore on it, its room's word: whether it stands.
    pub fn hold_ashore(&mut self, id: u32, seed: u64) -> bool {
        self.islands.hold_ashore(id, seed, self.clock)
    }

    /// The standing island whose door leads into the dungeon room `room` (`dungeon_room`, its name at Normal): a sea
    /// island's dungeon opens on this word alone, never for a seed or a style a page names.
    #[must_use]
    pub fn island_behind(&self, room: &str) -> Option<&SeaIsland> {
        let water = |island: &SeaIsland| self.chart.water_id(island.at).map(|water| dungeon_room(island.seed, water));
        self.islands.standing.iter().find(|island| water(island).is_some_and(|door| door == room))
    }

    /// Whether a course's path stands on, or crosses, a continent's coast or the coast of an island the player is
    /// told of, as the page bends its voyages round those alone. An island's coast the ship already lies within (a
    /// fight or a roll left it there) does not hold it: it may sail out.
    pub(super) fn crosses_land(&self, player: PlayerId, path: &[Point]) -> bool {
        let Some(&start) = path.first() else { return false };
        let told = self.islands.told(player, [start.x as f64, start.y as f64]).map(|island| &island.coast);
        let islands = outside(told, Some(start));
        let land = |point| super::on_land(&self.coasts, point) || super::on_land(islands.iter().copied(), point);
        let crosses = |leg: &[Point]| {
            super::leg_meets_land(&self.coasts, leg[0], leg[1])
                || super::leg_meets_land(islands.iter().copied(), leg[0], leg[1])
        };
        path.iter().any(|&point| land(point)) || path.windows(2).any(crosses)
    }

    /// The islands' tick, after the ships have sailed.
    pub(super) fn tick_islands(&mut self) {
        // Only a roll keeps clear of the ships' courses and the hostile ships: on other ticks neither is gathered.
        let rolls = self.clock.is_multiple_of(ROLL_EVERY_TICKS);
        let ships: Vec<ShipAndCourse> = self
            .berths
            .iter()
            .filter_map(|(player, berth)| {
                let Sailing { ship, course } = berth.sailing.as_ref()?;
                Some((*player, [ship.x, ship.y], if rolls { course.iter().copied().collect() } else { Vec::new() }))
            })
            .collect();
        let others: Vec<[f64; 2]> =
            if rolls { self.pirates().iter().map(|pirate| [pirate.x, pirate.y]).collect() } else { Vec::new() };
        self.islands.tick(self.clock, &ships, &others, (&self.chart, &self.coasts));
        // A ship at rest at an island's anchorage lands its account there; under way or elsewhere at sea, it is landed
        // nowhere. An account gone ashore keeps its landing, until its island fades.
        let islands = &mut self.islands;
        for (player, berth) in &self.berths {
            let Some(account) = self.harbour.accounts.get(player) else { continue };
            let rest = berth.sailing.as_ref().filter(|sailing| sailing.course.is_empty());
            let at = rest.map(|sailing| [sailing.ship.x, sailing.ship.y]);
            let lies =
                at.and_then(|at| islands.standing.iter().find(|island| apart(island.anchorage, at) <= LANDING_M));
            match lies {
                // Still lying where it landed, the same landing; at another island, a new one.
                Some(island) if islands.landed.get(account).is_some_and(|&(on, _)| on == island.id) => {}
                Some(island) => {
                    islands.landings = islands.landings.wrapping_add(1).max(1);
                    islands.landed.insert(account.clone(), (island.id, islands.landings));
                }
                None => {
                    islands.landed.remove(account);
                }
            }
        }
        islands.landed.retain(|_, (id, _)| islands.standing.iter().any(|island| island.id == *id));
    }

    /// The nearest standing island the player has found to a point: its number and where a ship anchors off it.
    pub(crate) fn nearest_found(&self, player: PlayerId, at: [f64; 2]) -> Option<(u32, [f64; 2])> {
        let found = self.islands.found_by(player).map(|island| (island.id, island.anchorage));
        found.min_by(|one, other| apart(one.1, at).total_cmp(&apart(other.1, at)))
    }
}

#[cfg(test)]
#[path = "sea_islands_tests.rs"]
mod sea_islands_tests;

/// The coasts a ship at `from` is held off by: every one but those it already lies within.
pub(crate) fn outside<'coast>(coasts: impl Iterator<Item = &'coast Coast>, from: Option<Point>) -> Vec<&'coast Coast> {
    coasts.filter(|coast| from.is_none_or(|from| !super::on_land(std::iter::once(*coast), from))).collect()
}
