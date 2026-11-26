//! The houses' roads in a room: its node and the places its file names, and each player's quest log told what they do
//! here (`gear::quests`): a place reached, checked each tick only for a player whose task waits on one in this node;
//! a foe's fall they struck; a spell cast; the node arrived in, and the sea island landed on. A kill goal's group stands
//! at its place for a player on it coming near, as a wave arrives, on the node's own navmesh where its square holds
//! that place and else on one baked round it the first time, and again `STAND_AGAIN` after it fell while the goal is
//! unmet.

use crate::garrison::{Post, SPREAD, STAND_AGAIN, draws_of, gird_of, ground_middle, square_baking, square_of};
use crate::players::Player;
use crate::{Floor, PlayerId, Room};
use ::foes::Rank;
use ::foes::roster::{FoeType, ROSTER};
use combat::fighter::FighterId;
use core::f64::consts::TAU;
use gear::quests::{Event, Goal, GoalDef, Kill, Place, RANKS, SPAWN_NEAR, Slay};
use movement::Terrain;
use navmesh::NavMesh;
use std::collections::BTreeMap;

/// The stream a road's groups draw their levels and shields from, apart from the garrison's.
const QUEST_STREAM: u64 = 0x7175_6573_7473;
/// How far apart the rings are that a group's place is looked for in when its middle is off the mesh, metres: within
/// the reach of the mesh's nearest point, so no ground the mesh holds is passed over.
const RING_STEP: f64 = 2.0;

/// A place's square and its navmesh, by the place's name.
pub(crate) type QuestMesh = (String, navmesh::Bounds, NavMesh);

/// A room's own for the roads: its node's id, the places its file names, its island's band of levels, each kill goal's
/// group standing here by the goal's quest, task and place in the task, with its foes, and the tick each one's last
/// group fell. The node's own square, once its places are known, and the square and navmesh round each place a group
/// has stood at, the one being baked and the tick a slice of one was last baked; and the mesh each foe's way was last
/// found on, but the node's own (`routes.rs`).
#[derive(Debug, Default)]
pub(crate) struct QuestGround {
    pub node: Option<String>,
    pub places: Vec<Place>,
    /// The paths its layout lays, that a figure walks (`steps.rs`), and the way between each pair of places found on
    /// them; each player's step running here, and the figure each saw arrive; the wards standing, which no snapshot
    /// shows; and the foes that drop nothing, a failed defence's.
    pub paths: Vec<Vec<[f64; 2]>>,
    pub ways: BTreeMap<(String, String), Vec<[f64; 2]>>,
    pub steps: BTreeMap<PlayerId, crate::steps::Step>,
    pub arrived: BTreeMap<PlayerId, crate::steps::Figure>,
    pub wards: std::collections::BTreeSet<FighterId>,
    pub spoilless: std::collections::BTreeSet<FighterId>,
    pub baked_at: Option<u64>,
    pub levels: Option<(u8, u8)>,
    pub groups: Vec<([usize; 3], Vec<FighterId>)>,
    pub fallen: Vec<([usize; 3], u64)>,
    pub square: Option<navmesh::Bounds>,
    pub grounds: Vec<QuestMesh>,
    pub baking: Option<(String, navmesh::Bounds, navmesh::Baking)>,
    pub way_on: BTreeMap<FighterId, usize>,
    /// Each rider the Tack's lesson watches here (`lessons.rs`).
    pub ridden: crate::lessons::Riders,
    /// Where another room marks the task's next goal, written in this one (the sea's, `Sea::lesson_mark`).
    pub mark: Option<[f64; 3]>,
    /// The lore read for what lies in its node (`lore.rs`): the file's, unless a test gives its own.
    pub lore: Option<&'static gear::lore::LoreDef>,
}

/// The side of the sea a hostile ship sails for, by its faction (the foes crate's), as a goal names it.
pub(crate) fn side_of(faction: u8) -> Option<&'static str> {
    match faction {
        ::foes::factions::GREY_TITHE => Some("tithe"),
        _ => None,
    }
}

/// A foe type of the roster by its name, and a rank by a goal's name for it.
pub(crate) fn named(name: &str, rank: &str) -> Option<(&'static FoeType, Rank)> {
    let foe = ROSTER.iter().find(|foe| foe.name == name)?;
    let number = RANKS.iter().position(|it| *it == rank)?;
    Some((foe, Rank::from_number(u8::try_from(number + 1).ok()?)?))
}

/// The roster's types and ranks a goal's list names, each a rank its type comes in.
pub(crate) fn foes_of<'list>(list: impl Iterator<Item = &'list (String, String)>) -> Vec<(u8, Rank)> {
    let found = list.filter_map(|(name, rank)| named(name, rank));
    found.filter(|(foe, rank)| foe.ranks.contains(rank)).map(|(foe, rank)| (foe.number, rank)).collect()
}

/// Whether a square's middle is a place's middle `at`, as near as a bake's sums keep it.
fn round(bounds: &navmesh::Bounds, at: [f64; 2]) -> bool {
    libm::fabs((bounds.min_x + bounds.max_x) / 2.0 - at[0]) < 0.5
        && libm::fabs((bounds.min_y + bounds.max_y) / 2.0 - at[1]) < 0.5
}

/// The point the mesh holds nearest a point on the ground: there, else the nearest found looking outward in rings
/// `RING_STEP` apart, as far as `reach`.
pub(crate) fn held_near(mesh: &NavMesh, floor: &Floor, at: [f64; 2], reach: f64) -> Option<[f64; 3]> {
    held_where(mesh, floor, at, reach, |_| true)
}

/// The point nearest a point on the ground that a path on the mesh reaches from `from`, looked for as `held_near`
/// looks: a puzzle's point may lie by ground the mesh holds but no walk reaches, up a bank or over a roof.
pub(crate) fn reached_near(
    mesh: &NavMesh,
    floor: &Floor,
    from: [f64; 3],
    at: [f64; 2],
    reach: f64,
) -> Option<[f64; 3]> {
    held_where(mesh, floor, at, reach, |point| mesh.find_path(from, *point).is_some())
}

fn held_where(
    mesh: &NavMesh,
    floor: &Floor,
    [x, y]: [f64; 2],
    reach: f64,
    keeps: impl Fn(&[f64; 3]) -> bool,
) -> Option<[f64; 3]> {
    let on = |east: f64, south: f64| {
        mesh.nearest_point([east, south, floor.height_at(east, south)]).filter(|point| keeps(point))
    };
    let apart = |point: &[f64; 3]| libm::hypot(point[0] - x, point[1] - y);
    let rings = (1..).map(|ring| f64::from(ring) * RING_STEP).take_while(|out| *out <= reach);
    on(x, y).or_else(|| {
        rings.into_iter().find_map(|out| {
            let around = (TAU * out / RING_STEP).ceil().max(8.0);
            let turns = (0..around as u32).map(|step| TAU * f64::from(step) / around);
            let found = turns.filter_map(|turn| on(x + libm::sin(turn) * out, y - libm::cos(turn) * out));
            found.min_by(|one, two| apart(one).total_cmp(&apart(two)))
        })
    })
}

/// Tells a player's quest log of an event; their gear goes out again when it counted.
fn tell_one(players: &mut BTreeMap<PlayerId, Player>, player: PlayerId, event: &Event<'_>) {
    if let Some(found) = players.get_mut(&player) {
        found.gear_changed |= found.character.tell(event);
    }
}

impl Room {
    /// The places of the node this room is, as its file names them, and its own square, which comes before theirs.
    pub fn set_places(&mut self, places: Vec<Place>) {
        self.quests.places = places;
        self.quests.square = self.own_square().or(self.quests.square);
    }

    /// The node's own square round its section's middle, which the meshes baked round places are told from.
    pub(crate) fn own_square(&self) -> Option<navmesh::Bounds> {
        let first = self.spawn_points.first().copied().unwrap_or_default();
        self.section.as_ref().map(|section| square_of(&[], ground_middle(section, first)).0)
    }

    /// The mesh round a place, by its number among the room's (`routes.rs`): the node's own (0) where its square holds
    /// all within `reach` each way of the place's middle, as far as what stands there stands; else one baked once it
    /// is needed, as large as the node's own and as it is (`garrison::square_baking`), and kept. A bake is some 150
    /// ms, so it is made a slice a tick (`navmesh::Baking`), the one under way stepped whichever place asks: none until
    /// it is whole, and none for another place meanwhile, which asks again on a later tick.
    pub(crate) fn ground_of(&mut self, place: &Place, reach: f64) -> Option<usize> {
        let at = place.at;
        if let Some(had) = self.ground_had(at, reach) {
            return Some(had);
        }
        if self.quests.baked_at == Some(self.clock) {
            return None;
        }
        self.quests.baked_at = Some(self.clock);
        let (floor, blocks) = (&self.floor, &self.blocks);
        let (_, _, baking) = self.quests.baking.get_or_insert_with(|| {
            let (bounds, baking) = square_baking(floor, blocks, (at[0], at[1]));
            (place.name.clone(), bounds, baking)
        });
        let mesh = baking.step(floor)?;
        let (name, bounds, _) = self.quests.baking.take()?;
        self.quests.grounds.push((name, bounds, mesh));
        round(&bounds, at).then_some(self.quests.grounds.len())
    }

    /// The mesh the room has round a place's middle `at` already, by its number: the node's own (0) where its square
    /// holds all within `reach` each way of it, else one baked before round that same middle, whatever its place is
    /// named (a namesake elsewhere has its own); none where one is yet to be baked.
    pub(crate) fn ground_had(&self, at: [f64; 2], reach: f64) -> Option<usize> {
        let holds = |bounds: &navmesh::Bounds| {
            let within = |low: f64, high: f64, at: f64| low <= at - reach && at + reach <= high;
            within(bounds.min_x, bounds.max_x, at[0]) && within(bounds.min_y, bounds.max_y, at[1])
        };
        if self.quests.square.as_ref().is_some_and(holds) {
            return Some(0);
        }
        self.quests.grounds.iter().position(|(_, bounds, _)| round(bounds, at)).map(|found| found + 1)
    }

    /// One of the room's meshes by its number: 0 the node's own, else a place's.
    pub(crate) fn mesh_by(&self, ground: usize) -> &NavMesh {
        ground.checked_sub(1).and_then(|at| self.quests.grounds.get(at)).map_or(&self.nav, |(_, _, mesh)| mesh)
    }

    /// How many navmeshes the room has baked round its places.
    #[must_use]
    pub fn place_grounds(&self) -> usize {
        self.quests.grounds.len()
    }

    /// Sets where the task's next goal is marked for the player this room writes gear for at sea.
    pub fn mark_quest(&mut self, mark: Option<[f64; 3]>) {
        self.quests.mark = mark;
    }

    /// Tells a player's quest log of something they did here.
    pub(crate) fn tell_quest(&mut self, player: PlayerId, event: &Event<'_>) {
        tell_one(&mut self.players, player, event);
    }

    /// The kind of sea island this room is, as a goal names it.
    fn island_kind(&self) -> Option<&'static str> {
        let kind = self.isle.as_ref()?.kind?;
        Some(if kind.is_isle() { "isle" } else { "cove" })
    }

    /// Whether a player stands landed on this sea island: one whose landings nobody checks, or with the sea's word for
    /// their account (`land`).
    pub(crate) fn landed(&self, player: PlayerId) -> bool {
        let (Some(isle), Some(found)) = (self.isle.as_ref(), self.players.get(&player)) else { return false };
        isle.landed.as_ref().is_none_or(|landed| found.owner.as_ref().is_some_and(|owner| landed.contains_key(owner)))
    }

    /// Tells a player's quest log they landed on this sea island, once the room knows they did.
    pub(crate) fn tell_landed(&mut self, player: PlayerId) {
        if let Some(island) = self.island_kind().filter(|_| self.landed(player)) {
            tell_one(&mut self.players, player, &Event::Land(island));
        }
    }

    /// A player arrived: in this node, and on this sea island if they landed.
    pub(crate) fn arrived(&mut self, player: PlayerId) {
        if let Some(node) = self.quests.node.as_deref() {
            tell_one(&mut self.players, player, &Event::Enter(node));
        }
        self.tell_landed(player);
    }

    /// A foe's fall a player struck: its roster's name and rank's number, where it fell; on a sea island only for one
    /// who landed.
    pub(crate) fn tell_kill(&mut self, player: PlayerId, foe: &str, rank: u8, at: [f64; 2]) {
        let island = self.island_kind().filter(|_| self.landed(player));
        let (node, places) = (self.quests.node.as_deref(), self.quests.places.as_slice());
        tell_one(&mut self.players, player, &Event::Kill(Kill { node, at, places, foe, rank, island }));
    }

    /// Each tick: a player whose task waits on a place of this node standing within its reach reaches it; one on a
    /// kill goal with a group to stand, within `SPAWN_NEAR` of its place, stands it, unless it stands, or its last fell
    /// within `STAND_AGAIN`; and a group no player here pursues, fighting no one, is sent away.
    pub(crate) fn keep_quests(&mut self) {
        let Some(node) = self.quests.node.as_deref() else { return };
        let (mut reached, mut near, mut pursued) = (Vec::new(), Vec::new(), Vec::new());
        for (id, found) in &self.players {
            let at = [found.fighter.body.x, found.fighter.body.y];
            let now = found.character.quest_now();
            for (goal_at, goal) in found.character.goals_unmet() {
                let (Some(name), Some((quest, task))) = (goal.goal.place(), now) else { continue };
                if goal.goal.node() != Some(node) {
                    continue;
                }
                let mut here = self.quests.places.iter().filter(|place| place.name == name);
                match &goal.goal {
                    Goal::Reach(_) if here.any(|place| place.holds(at, 0.0)) => reached.push((*id, goal)),
                    Goal::Kill(Slay { spawn, .. }) if !spawn.is_empty() => {
                        pursued.push([quest, task, goal_at]);
                        let close =
                            here.find(|place| libm::hypot(at[0] - place.at[0], at[1] - place.at[1]) <= SPAWN_NEAR);
                        near.extend(close.map(|place| ([quest, task, goal_at], goal, place.clone())));
                    }
                    Goal::Reach(_)
                    | Goal::Kill(_)
                    | Goal::Talk(_)
                    | Goal::Pledge(_)
                    | Goal::Gather(_)
                    | Goal::Cast(_)
                    | Goal::Sea(_)
                    | Goal::Land(_)
                    | Goal::Scavenge(_)
                    | Goal::Enter(_)
                    | Goal::Buy(_)
                    | Goal::Wear(_)
                    | Goal::Ride(_)
                    | Goal::Sail(_)
                    | Goal::Escort(_)
                    | Goal::Tail(_)
                    | Goal::Defend(_)
                    | Goal::Puzzle(_)
                    | Goal::Unseen(_)
                    | Goal::Race(_) => {}
                }
            }
        }
        for (player, goal) in reached {
            let Goal::Reach(reach) = &goal.goal else { continue };
            self.tell_quest(player, &Event::Reach { node: &reach.node, place: &reach.place });
        }
        let (foes, clock, ground) = (&self.foes, self.clock, &mut self.quests);
        let standing = |ids: &[FighterId]| ids.iter().any(|id| foes.get(id).is_some_and(|foe| !foe.fighter.dead()));
        let fell: Vec<[usize; 3]> =
            ground.groups.iter().filter(|(_, ids)| !standing(ids)).map(|(key, _)| *key).collect();
        ground.groups.retain(|(_, ids)| standing(ids));
        ground.fallen.retain(|(key, at)| clock < at + STAND_AGAIN && !fell.contains(key));
        ground.fallen.extend(fell.into_iter().map(|key| (key, clock)));
        let idle = |ids: &[FighterId]| ids.iter().all(|id| foes.get(id).is_none_or(|foe| foe.brain.fights().is_none()));
        let unsought = |(key, ids): &([usize; 3], Vec<FighterId>)| !pursued.contains(key) && idle(ids);
        let gone: Vec<FighterId> =
            ground.groups.iter().filter(|each| unsought(each)).flat_map(|(_, ids)| ids.clone()).collect();
        ground.groups.retain(|each| !unsought(each));
        self.send_away(&gone);
        for (key, goal, place) in near {
            let waits = |each: &[usize; 3]| *each == key;
            let quests = &self.quests;
            if !quests.groups.iter().any(|(each, _)| waits(each)) && !quests.fallen.iter().any(|(each, _)| waits(each))
            {
                self.stand_group(key, goal, &place);
            }
        }
    }

    /// Stands a kill goal's group on its place's own mesh, facing out and holding its ground, at the island's levels
    /// raised by the seas, as an arriving post that never stands again once it falls: round the place's middle, or
    /// where the middle stands off the mesh (in a building or a heap of stones), round the nearest point within the
    /// place's reach the mesh holds. None while the room's living foes leave no room, or the mesh holds no point there.
    fn stand_group(&mut self, key: [usize; 3], goal: &'static GoalDef, place: &Place) {
        let members = foes_of(goal.goal.foes());
        if members.is_empty() || self.living_foes() + members.len() > self.others_most() {
            return;
        }
        let Some(ground) = self.ground_of(place, place.radius) else { return };
        let seed = self.world_seed ^ QUEST_STREAM ^ (key[0] << 16 | key[1] << 8 | key[2]) as u64;
        if let Some(stood) = self.stand_arriving(ground, place.at, place.radius, &members, SPREAD, seed) {
            self.quests.groups.push((key, stood));
        }
    }

    /// Stands foes as an arriving post on one of the room's place meshes: round the point it holds nearest `centre`
    /// within `reach`, each `out` metres round it facing out, at the island's levels raised by the seas, drawn from
    /// `seed`. Their numbers, or none where the mesh holds no point there.
    pub(crate) fn stand_arriving(
        &mut self,
        ground: usize,
        centre: [f64; 2],
        reach: f64,
        members: &[(u8, Rank)],
        out: f64,
        seed: u64,
    ) -> Option<Vec<FighterId>> {
        let mesh = self.mesh_by(ground);
        let at = held_near(mesh, &self.floor, centre, reach)?;
        let start = draws_of(seed).draw() * TAU;
        let mut post = Post {
            at,
            members: Vec::new(),
            girds: Vec::new(),
            beat: None,
            standing: Vec::new(),
            cleared_at: None,
            leader: None,
            broken: false,
            defending: false,
            fallback: at,
            anchor: None,
            arrival: true,
        };
        for (nth, &(number, rank)) in members.iter().enumerate() {
            let facing = start + TAU * nth as f64 / members.len() as f64;
            let wanted = [at[0] + libm::sin(facing) * out, at[1] - libm::cos(facing) * out];
            let spot = held_near(mesh, &self.floor, wanted, reach).unwrap_or(at);
            let (level, shield) =
                gird_of(seed, u32::try_from(nth).unwrap_or(0), self.quests.levels, self.shield_chance());
            post.members.push((number, rank, spot, facing));
            post.girds.push((level, shield.filter(|_| !matches!(rank, Rank::Miniboss | Rank::Boss))));
        }
        self.garrison.push(post);
        let stood = self.garrison.len() - 1;
        // An arrival is no group of the garrison's: the last stand keeps its leader and its break.
        let last_stand = self.encounter.as_ref().map(|encounter| (encounter.leader, encounter.broken));
        self.stand_post(stood);
        if let (Some(encounter), Some(kept)) = (self.encounter.as_mut(), last_stand) {
            (encounter.leader, encounter.broken) = kept;
        }
        Some(self.garrison[stood].standing.clone())
    }

    /// Where the first goal not yet met of a player's task with a place in this room stands: its middle and its
    /// reach, or a step's own spot (`step_spot`); none when no such goal is here. A mark set from another room
    /// (`mark_quest`) stands for it.
    #[must_use]
    pub fn quest_at(&self, player: PlayerId) -> Option<[f64; 3]> {
        if self.quests.mark.is_some() {
            return self.quests.mark;
        }
        let node = self.quests.node.as_deref()?;
        let found = self.players.get(&player)?;
        found.character.goals_unmet().find_map(|(at, goal)| {
            if goal.goal.node() != Some(node) {
                return None;
            }
            if goal.kind().stepped() {
                return self.step_spot(player, at, goal);
            }
            let place = self.quests.places.iter().find(|place| Some(place.name.as_str()) == goal.goal.place())?;
            Some([place.at[0], place.at[1], place.radius])
        })
    }
}

#[cfg(test)]
#[path = "quests_tests.rs"]
pub(crate) mod quests_tests;

#[cfg(test)]
#[path = "quest_grounds_tests.rs"]
pub(crate) mod quest_grounds_tests;

#[cfg(test)]
#[path = "welcome_tests.rs"]
mod welcome_tests;
