//! A passage zone's foes: who stands at its depth, its bands on the sites' posts, its waves, and how many it stands at
//! once. The depth sets the roster from the Grey Tithe's own (`Enemies.md`): its walkers, collectors and crossbowmen
//! shallow, its Enforcers among them from depth 6 and its Majors alone past 10, the Tithe-Taker and the Reeve leading
//! deep; a strand, an old sea floor with its wrecks inland, stands the Tithe's deck crew. A lamp's guard is the
//! design's, its Miniboss the Reeve at the second lamp and the Tithe-Mate at the third, and the fourth lamp's an Elite
//! Dungeon's Boss of the island's, by the week. The most a zone stands is by its size, Crowded's extra foes not counted,
//! and rises with its players as a public event's waves and great foes do (`Passages.md`, "A zone's room").

use super::{BAND_STREAM, WAVE_STREAM};
use crate::garrison::{Group, draws_of, index};
use crate::{PlayerId, Room};
use ::foes::Rank::{self, Boss, Elite, Major, Miniboss, Minor};
use ::foes::roster::{
    BOSUN, COLLECTOR, CROSSBOWMAN, DECKHAND, ENFORCER, HOOKMAN, MARKSMAN, PISTOLEER, REEVE, RUNNER, TITHE_MATE,
    TITHE_TAKER,
};
use combat::fighter::FighterId;
use combat::sight::{apart, bearing};
use movement::{TUNING, Terrain};
use naval::random::Mulberry32;
use passage::{Current, Deal, Form, Ground, Mission};
use reach::Section;

/// The bands' foes by depth: shallow (1 to 5), middle (6 to 10), deep (11 to 15) and deepest (16 to 20).
const SHALLOW: [(u8, Rank); 6] = [
    (RUNNER, Minor),
    (RUNNER, Major),
    (COLLECTOR, Minor),
    (COLLECTOR, Major),
    (CROSSBOWMAN, Minor),
    (CROSSBOWMAN, Major),
];
const MIDDLE: [(u8, Rank); 6] = [
    (RUNNER, Minor),
    (RUNNER, Major),
    (COLLECTOR, Major),
    (CROSSBOWMAN, Minor),
    (CROSSBOWMAN, Major),
    (ENFORCER, Major),
];
const DEEP: [(u8, Rank); 5] =
    [(RUNNER, Major), (COLLECTOR, Major), (CROSSBOWMAN, Major), (ENFORCER, Major), (COLLECTOR, Major)];
/// A strand's, the Tithe's deck crew: Deckhands, Hookmen and Pistoleers, their Bosuns among them past depth 10.
const DECK: [(u8, Rank); 6] =
    [(DECKHAND, Minor), (DECKHAND, Major), (HOOKMAN, Minor), (HOOKMAN, Major), (PISTOLEER, Minor), (PISTOLEER, Major)];
const DECK_DEEP: [(u8, Rank); 4] = [(DECKHAND, Major), (HOOKMAN, Major), (PISTOLEER, Major), (BOSUN, Major)];
/// The Elites that lead a band, and make an Elite band: the Enforcer and the Marksman, the Tithe-Taker with them past
/// depth 10, the Reeve past 15; on a strand the Bosun and the Tithe-Mate.
const ELITES: [u8; 4] = [ENFORCER, MARKSMAN, TITHE_TAKER, REEVE];
const DECK_ELITES: [u8; 2] = [BOSUN, TITHE_MATE];
/// How many more foes a zone stands for each player in it past the first, and a wave brings, at most this many more.
const FOES_PER_PLAYER: usize = 3;
const WAVE_MORE_MOST: usize = 3;
/// How much more health a zone's Miniboss or Boss stands with for each player in it past the first.
const HEALTH_PER_PLAYER: f64 = 0.5;
/// No held band stands, and no wave, nearer a player than this (m).
pub(crate) const CLEAR_M: f64 = 12.0;
/// How far from a deal's foe's place the mesh is looked for where none lies within 4 m of it (m): a wave's place, a
/// band's spread round a spot in a dungeon's nook the mesh leaves out, can lie 6 m past it.
const OFF_MESH_M: f64 = 8.0;
/// How far off a solid's edge a deal's foe is placed where the mesh's point lies on it (m): past a cell of a
/// dungeon's mesh.
const EDGE_OFF_M: f64 = 0.5;

/// Who stands in a zone: its bands' foes and its Elites.
struct Roster {
    members: &'static [(u8, Rank)],
    elites: &'static [u8],
}

/// The roster at a depth, on a strand or not.
fn roster(depth: u8, strand: bool) -> Roster {
    match (strand, depth) {
        (true, 0..=10) => Roster { members: &DECK, elites: &DECK_ELITES },
        (true, _) => Roster { members: &DECK_DEEP, elites: &DECK_ELITES },
        (false, 0..=5) => Roster { members: &SHALLOW, elites: &ELITES[..2] },
        (false, 6..=10) => Roster { members: &MIDDLE, elites: &ELITES[..2] },
        (false, 11..=15) => Roster { members: &DEEP, elites: &ELITES[..3] },
        (false, _) => Roster { members: &DEEP, elites: &ELITES },
    }
}

/// The roster at a depth off a strand, its members and its Elites, as the band reckons their pay (`gear::band`).
#[cfg(test)]
pub(crate) fn roster_of(depth: u8) -> (&'static [(u8, Rank)], &'static [u8]) {
    let Roster { members, elites } = roster(depth, false);
    (members, elites)
}

/// A lamp's guard's Miniboss, or its Boss at the fourth: the Reeve, the Tithe-Mate, and one of the island's two Elite
/// Dungeons' Bosses, the week's by turns.
fn lamp_guard(lamp: u8, island: &str, week: u64) -> Option<(u8, Rank)> {
    match lamp {
        2 => Some((REEVE, Miniboss)),
        3 => Some((TITHE_MATE, Miniboss)),
        4 => {
            let place = gear::activities::ISLAND_PLACES.iter().find(|place| place.continent == island)?;
            Some((place.elite[usize::from(week % 2 == 1)].boss, Boss))
        }
        _ => None,
    }
}

/// A vault's Miniboss in its end room: the Reeve to depth 10, the Tithe-Mate past it.
pub(crate) fn vault_miniboss(depth: u8) -> (u8, Rank) {
    if depth > 10 { (TITHE_MATE, Miniboss) } else { (REEVE, Miniboss) }
}

impl Room {
    /// Whether the zone is a strand above ground, where the deck crew stand.
    fn strand(&self) -> bool {
        self.zone().is_some_and(|zone| zone.zone.ground == Ground::Open { form: Form::Strand })
    }

    /// The most foes the zone stands at once now: its size's, Crowded's extra foes in each band standing, and three
    /// more for each player in it past the first.
    pub(crate) fn zone_foes_most(&self) -> usize {
        let bands = self.zone().map_or(0, |zone| zone.round.guards.len());
        self.counted_most() + self.band_crowding() * bands
    }

    /// The most foes, Crowded's not counted: the size's, and three more for each player in the zone past the first.
    fn counted_most(&self) -> usize {
        let Some(zone) = self.zone() else { return self.foes_most };
        zone.zone.size.foes_most() + FOES_PER_PLAYER * self.players.len().saturating_sub(1)
    }

    /// The bands on the sites' posts, as many as the zone's most foes allow, the rest held back: a lamp's guard as the
    /// design gives it (an Elite band at the first lamp, a Miniboss and an Elite band at the second and third, a Boss
    /// and two Elite bands at the fourth); any other zone's a band on each post, from depth 6 one band in three led by
    /// an Elite and from depth 11 every band; none for a deal whose foes come in waves alone.
    pub(crate) fn stand_bands(&mut self, levels: (u8, u8)) {
        let Some(zone) = self.zone() else { return };
        let (deal, depth, posts) = (zone.zone.deal, zone.zone.depth, zone.sites.posts.clone());
        let (island, week, lamp) = (zone.island, zone.week, passage::lamp_number(depth));
        let near_lamp = zone.sites.lamp;
        let mut draws = draws_of(self.world_seed ^ BAND_STREAM);
        let mut groups: Vec<Group> = match (deal, lamp) {
            (Deal::Lamp, Some(number)) => {
                let great = lamp_guard(number, island, week).map(|great| Group {
                    members: vec![great],
                    leads: false,
                    farthest: true,
                });
                let elites = if number >= 4 { 2 } else { 1 };
                let bands: Vec<Group> = (0..elites).map(|_| self.band(&mut draws, depth, Some(true))).collect();
                great.into_iter().chain(bands).collect()
            }
            (Deal::Mission(Mission::Kindle | Mission::Hold | Mission::Ambush), _) => Vec::new(),
            _ => (0..posts.len()).map(|nth| self.band(&mut draws, depth, (nth % 3 == 0).then_some(false))).collect(),
        };
        if deal == Deal::Mission(Mission::Hunt) {
            // The marked band walks a round of the spots; the rest hold their posts.
            if let Some(first) = groups.first_mut() {
                first.farthest = false;
                if let Some(leader) = first.members.first_mut() {
                    *leader = (roster(depth, self.strand()).elites[0], Elite);
                }
            }
        }
        let crowding = self.band_crowding();
        let most = self.counted_most();
        let (mut standing, mut stood) = (0, 0);
        for (nth, group) in groups.into_iter().enumerate() {
            let at = match (nth, near_lamp) {
                (0, Some(lamp)) if deal == Deal::Lamp => [lamp[0] + 4.5, lamp[1]],
                _ => posts.get(nth).copied().unwrap_or(posts.first().copied().unwrap_or_default()),
            };
            // Crowded's extra foes do not count against the most: it holds as many bands.
            let counted = group.members.len().saturating_sub(crowding);
            if stood == 0 || standing + counted <= most {
                if self.stand_band(&group, at, levels) {
                    (standing, stood) = (standing + counted, stood + 1);
                }
            } else if let Some(zone) = self.zone_mut() {
                zone.held.push((group.members, group.farthest, at));
            }
        }
    }

    /// Stands a band at a post, girded at the zone's levels, Hardened's health on it, its places and its beat inside
    /// the hollow's floor above ground and the section under it: whether it stood.
    fn stand_band(&mut self, group: &Group, at: [f64; 2], levels: (u8, u8)) -> bool {
        let floor = self.zone().and_then(|zone| zone.floor.clone());
        let Some(section) = self.section.clone() else { return false };
        let section = Section { ring: floor.unwrap_or(section.ring), spawns: Vec::new(), ..section };
        let spots: Vec<(f64, f64)> =
            self.zone().map(|zone| zone.sites.spots.iter().map(|at| (at[0], at[1])).collect()).unwrap_or_default();
        let nth = (self.garrison.len() as u64) << 8;
        let mut draws = draws_of(self.world_seed ^ BAND_STREAM ^ nth);
        let mut beats = draws_of(self.world_seed ^ BAND_STREAM ^ 1 ^ nth);
        let lattice: &[(f64, f64)] = if group.farthest { &[] } else { &spots };
        let Some(mut post) = self.post_at(group, (at[0], at[1]), (&section, lattice), (&mut draws, &mut beats)) else {
            return false;
        };
        let (seed, shield_chance) = (self.world_seed, self.shield_chance());
        let girded: u32 = self.garrison.iter().map(|post| post.members.len() as u32).sum();
        for (nth, &(_, rank, _, _)) in (girded..).zip(&post.members) {
            let (level, shield) = crate::garrison::gird_of(seed, nth, Some(levels), shield_chance);
            post.girds.push((level, shield.filter(|_| !matches!(rank, Miniboss | Boss))));
        }
        self.garrison.push(post);
        let number = self.garrison.len() - 1;
        self.stand_post(number);
        self.harden(&[number]);
        if let Some(zone) = self.zone_mut() {
            zone.round.guards.push(number);
        }
        self.toughen_posts(&[number]);
        true
    }

    /// Each tick: the most foes kept to the players in the zone, its Minibosses and Bosses toughened as more come, and
    /// a band held back stood once there is room and no player within CLEAR_M of its post.
    pub(crate) fn keep_zone_foes(&mut self) {
        let Some(zone) = self.zone() else { return };
        let (most_seen, levels, running) = (zone.most_seen, zone.levels, zone.round.done_at.is_none());
        let players = self.players.len();
        if players > most_seen {
            let standing: Vec<FighterId> = self.foes.keys().copied().collect();
            self.toughen_great(&standing, most_seen.max(1), players);
            if let Some(zone) = self.zone_mut() {
                zone.most_seen = players;
            }
        }
        self.foes_most = self.zone_foes_most();
        let Some((members, farthest, at)) = self.zone().and_then(|zone| zone.held.first().cloned()) else { return };
        let group = Group { members, leads: false, farthest };
        // The bands stood, their foes fallen or not, hold the zone's most: only more players stand more.
        let crowding = self.band_crowding();
        let counted = |members: usize| members.saturating_sub(crowding);
        let guards = self.zone().map(|zone| zone.round.guards.clone()).unwrap_or_default();
        let stood: usize =
            guards.iter().filter_map(|&post| self.garrison.get(post)).map(|post| counted(post.members.len())).sum();
        let room_for = stood + counted(group.members.len()) <= self.counted_most();
        let clear =
            self.players.values().all(|player| apart([player.fighter.body.x, player.fighter.body.y], at) >= CLEAR_M);
        if running && room_for && clear {
            // One whose post the mesh no longer reaches is let go, not tried again each tick.
            self.stand_band(&group, at, levels);
            if let Some(zone) = self.zone_mut() {
                zone.held.remove(0);
            }
        }
    }

    /// The Minibosses and Bosses standing anew at these posts take the health of the most players the zone has seen.
    pub(crate) fn toughen_posts(&mut self, posts: &[usize]) {
        let most_seen = self.zone().map_or(1, |zone| zone.most_seen);
        let standing: Vec<FighterId> =
            posts.iter().filter_map(|&post| self.garrison.get(post)).flat_map(|post| post.standing.clone()).collect();
        self.toughen_great(&standing, 1, most_seen);
    }

    /// Each living Miniboss and Boss of `standing` stands with the health of `to` players' share where it stood with
    /// `from` players'.
    fn toughen_great(&mut self, standing: &[FighterId], from: usize, to: usize) {
        let share = |players: usize| 1.0 + HEALTH_PER_PLAYER * players.saturating_sub(1) as f64;
        let times = share(to) / share(from);
        if (times - 1.0).abs() < 1e-9 {
            return;
        }
        for id in standing {
            let Some(foe) = self.foes.get_mut(id).filter(|foe| !foe.fighter.dead()) else { continue };
            if matches!(foe.brain.rank, Miniboss | Boss) {
                foe.grow(times);
            }
        }
    }

    /// A band of the zone's roster at a depth: two to four, one or two more where Crowded runs, Veteran's share of its
    /// Minors standing as Majors, and led by an Elite where `elite` says (an Elite band, three Elites, for
    /// Some(true)), or as its depth makes it (from 6 one band in three, from 11 every band).
    fn band(&self, draws: &mut Mulberry32, depth: u8, elite: Option<bool>) -> Group {
        let size = 2 + index(draws, 3) + self.crowding();
        let elites = roster(depth, self.strand()).elites;
        let mut members: Vec<(u8, Rank)> = (0..size).map(|_| self.member(draws, depth)).collect();
        let led = match elite {
            Some(true) => true,
            Some(false) => depth >= 6,
            None => depth >= 11,
        };
        if led {
            members[0] = (elites[index(draws, elites.len())], Elite);
            if elite == Some(true) {
                members.truncate(3);
                for member in members.iter_mut().skip(1) {
                    *member = (elites[index(draws, elites.len())], Elite);
                }
            }
        }
        Group { members, leads: false, farthest: true }
    }

    /// One of the roster's foes at a depth, Veteran's share of its Minors standing as Majors.
    fn member(&self, draws: &mut Mulberry32, depth: u8) -> (u8, Rank) {
        let members = roster(depth, self.strand()).members;
        let veteran = self.current(Current::Veteran).map_or(0.0, |strength| passage::zone::VETERAN * strength);
        let (number, rank) = members[index(draws, members.len())];
        let raised = rank == Minor && draws.draw() < veteran;
        (number, if raised { Major } else { rank })
    }

    /// How many of a band's foes Crowded added, which its most does not count: none in a lamp's, whose Elite bands are
    /// cut to three, Crowded's extra foes with them.
    fn band_crowding(&self) -> usize {
        if self.zone().is_some_and(|zone| zone.zone.deal == Deal::Lamp) { 0 } else { self.crowding() }
    }

    /// How many more foes Crowded stands in each band and wave: one, two past depth 14.
    pub(crate) fn crowding(&self) -> usize {
        let depth = self.zone().map_or(1, |zone| zone.zone.depth);
        match self.current(Current::Crowded) {
            Some(_) if depth > 14 => 2,
            Some(_) => 1,
            None => 0,
        }
    }

    /// Hardened's share more health on every foe standing at these garrison posts, as they stand.
    pub(crate) fn harden(&mut self, posts: &[usize]) {
        let Some(strength) = self.current(Current::Hardened) else { return };
        let standing: Vec<FighterId> =
            posts.iter().filter_map(|&post| self.garrison.get(post)).flat_map(|post| post.standing.clone()).collect();
        for id in standing {
            if let Some(foe) = self.foes.get_mut(&id) {
                foe.grow(1.0 + passage::zone::HARDENED * strength);
            }
        }
    }

    /// A wave of the Tithe: `size` of the zone's roster (two to four if none is asked, Crowded's more and a foe more
    /// for each player past the first), at the post or spot at least CLEAR_M from every player that is nearest one,
    /// each hunting the nearest player; none while the zone's waves standing leave no room for them.
    pub(crate) fn call_wave(&mut self, size: Option<usize>) {
        let Some(zone) = self.zone() else { return };
        let (called, depth) = (u32::from(zone.round.waves) + zone.round.number * 32, zone.zone.depth);
        let places: Vec<[f64; 2]> = zone.sites.posts.iter().chain(&zone.sites.spots).copied().collect();
        let mut draws = draws_of(self.world_seed ^ WAVE_STREAM ^ u64::from(called));
        let more = self.players.len().saturating_sub(1).min(WAVE_MORE_MOST);
        let size = size.unwrap_or_else(|| 2 + index(&mut draws, 3) + more) + self.crowding();
        // Only the zone's waves count against its most here, so a reliquary's keepers and a vein's waves still come
        // while its bands stand.
        let waves = self.zone().map_or(0, |zone| {
            zone.round.wave_foes.iter().filter(|id| self.foes.get(id).is_some_and(|foe| !foe.fighter.dead())).count()
        });
        if waves + size > self.counted_most() + self.crowding() {
            return;
        }
        let players: Vec<(PlayerId, [f64; 3])> = self
            .players
            .iter()
            .filter(|(_, player)| !player.fighter.dead())
            .map(|(id, player)| (*id, [player.fighter.body.x, player.fighter.body.y, player.fighter.body.z]))
            .collect();
        let nearest =
            |at: [f64; 2]| players.iter().map(|(_, body)| apart([body[0], body[1]], at)).fold(f64::INFINITY, f64::min);
        let open = places.into_iter().filter(|at| nearest(*at) >= CLEAR_M);
        let Some(from) = open.min_by(|one, two| nearest(*one).total_cmp(&nearest(*two))) else { return };
        let mut ids = Vec::new();
        for nth in 0..size {
            let member = self.member(&mut draws, depth);
            let turn = core::f64::consts::TAU * nth as f64 / size as f64;
            let at = [
                from[0] + libm::sin(turn) * crate::garrison::SPREAD,
                from[1] - libm::cos(turn) * crate::garrison::SPREAD,
            ];
            let facing = players.first().map_or(0.0, |(_, body)| bearing(at, [body[0], body[1]]));
            ids.extend(self.stand_deal_foe(member, at, facing, 1_000 + called * 16 + nth as u32));
        }
        let clock = self.clock;
        for id in &ids {
            let Some(foe) = self.foes.get(id) else { continue };
            let here = [foe.fighter.body.x, foe.fighter.body.y];
            let hunted = players.iter().min_by(|one, two| {
                apart(here, [one.1[0], one.1[1]]).total_cmp(&apart(here, [two.1[0], two.1[1]])).then(one.0.cmp(&two.0))
            });
            if let (Some((player, body)), Some(foe)) = (hunted.copied(), self.foes.get_mut(id)) {
                foe.brain.hunt(player, body, clock);
            }
        }
        if let Some(zone) = self.zone_mut() {
            zone.round.waves = zone.round.waves.saturating_add(1);
            zone.round.wave_foes.extend(ids);
        }
    }

    /// A foe stood for the deal outside its bands (a wave's, a target's), at the zone's levels and the currents' weight.
    pub(crate) fn stand_deal_foe(
        &mut self,
        (number, rank): (u8, Rank),
        at: [f64; 2],
        facing: f64,
        nth: u32,
    ) -> Option<FighterId> {
        let levels = self.zone()?.levels;
        // Placed on the floor's level: a dungeon's rock and solids stand as tall as its walls, and a place inside one
        // read at its top finds no floor near and stands its foe up there, out of every player's reach.
        let ground = [at[0], at[1], self.floor.floor_at(at[0], at[1])];
        // In a nook the mesh leaves out it stands at the mesh's point nearest, further off; where no mesh is near, none.
        let mesh = self.mesh_at(ground);
        let place = mesh.nearest_point(ground).or_else(|| mesh.nearest_point_within(ground, OFF_MESH_M))?;
        // The mesh is cut in cells, so its point can lie on a dungeon solid's very edge, where the ground reads the
        // solid's top: the mesh's point nearest one a little off it, round it, is taken instead.
        let on_floor = |point: &[f64; 3]| self.floor.height_at(point[0], point[1]) <= point[2] + TUNING.step;
        let mut off_edge = (0..8).filter_map(|turn| {
            let angle = core::f64::consts::TAU * f64::from(turn) / 8.0;
            let point = [place[0] + libm::sin(angle) * EDGE_OFF_M, place[1] - libm::cos(angle) * EDGE_OFF_M, place[2]];
            mesh.nearest_point(point)
        });
        let place = if on_floor(&place) { place } else { off_edge.find(on_floor).unwrap_or(place) };
        let id = self.stand_foe(::foes::foe_type(number)?, rank, place, facing, None);
        let (level, shield) =
            crate::garrison::gird_of(self.world_seed ^ BAND_STREAM ^ 2, nth, Some(levels), self.shield_chance());
        self.gird(id, self.at_seas(level), shield);
        if let Some(strength) = self.current(Current::Hardened)
            && let Some(foe) = self.foes.get_mut(&id)
        {
            foe.grow(1.0 + passage::zone::HARDENED * strength);
        }
        self.foes.get_mut(&id)?.brain.posted_at(place, facing);
        Some(id)
    }
}
