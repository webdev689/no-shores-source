//! The houses' roads in a room: its node and the places its file names, and each player's quest log told what they do
//! here (`gear::quests`): a place reached, checked each tick only for a player whose task waits on one in this node;
//! a foe's fall they struck; a spell cast; the node arrived in, and the sea island landed on. A kill goal's group stands
//! at its place for a player on it coming near, as a wave arrives, on a navmesh baked round that place the first time,
//! and again `STAND_AGAIN` after it fell while the goal is unmet.

use crate::garrison::{Post, SPREAD, STAND_AGAIN, draws_of, gird_of, ground_middle, square, square_of};
use crate::players::Player;
use crate::{Floor, PlayerId, Room};
use ::foes::Rank;
use ::foes::roster::{FoeType, ROSTER};
use combat::fighter::FighterId;
use core::f64::consts::TAU;
use gear::quests::{Event, GoalDef, GoalKind, Kill, Place, RANKS, SPAWN_NEAR};
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
/// has stood at; and the mesh each foe's way was last found on, but the node's own (`routes.rs`).
#[derive(Debug, Default)]
pub(crate) struct QuestGround {
    pub node: Option<String>,
    pub places: Vec<Place>,
    pub levels: Option<(u8, u8)>,
    pub groups: Vec<([usize; 3], Vec<FighterId>)>,
    pub fallen: Vec<([usize; 3], u64)>,
    pub square: Option<navmesh::Bounds>,
    pub grounds: Vec<QuestMesh>,
    pub way_on: BTreeMap<FighterId, usize>,
}

/// The side of the sea a hostile ship sails for, by its faction (the foes crate's), as a goal names it.
pub(crate) fn side_of(faction: u8) -> Option<&'static str> {
    match faction {
        ::foes::factions::GREY_TITHE => Some("tithe"),
        ::foes::factions::PIRATES => Some("pirates"),
        _ => None,
    }
}

/// A foe type of the roster by its name, and a rank by a goal's name for it.
fn named(name: &str, rank: &str) -> Option<(&'static FoeType, Rank)> {
    let foe = ROSTER.iter().find(|foe| foe.name == name)?;
    let number = RANKS.iter().position(|it| *it == rank)?;
    Some((foe, Rank::from_number(u8::try_from(number + 1).ok()?)?))
}

/// The point the mesh holds nearest a point on the ground: there, else the nearest found looking outward in rings
/// `RING_STEP` apart, as far as `reach`.
fn held_near(mesh: &NavMesh, floor: &Floor, [x, y]: [f64; 2], reach: f64) -> Option<[f64; 3]> {
    let on = |east: f64, south: f64| mesh.nearest_point([east, south, floor.height_at(east, south)]);
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
        let Some(section) = self.section.as_ref() else { return };
        let first = self.spawn_points.first().copied().unwrap_or_default();
        self.quests.square = Some(square_of(&[], ground_middle(section, first)).0);
    }

    /// The mesh round a place, by its place among those baked: baked the first time a group stands there, as large as
    /// the node's own and as it is (`garrison::square`), and kept.
    pub(crate) fn ground_of(&mut self, place: &Place) -> usize {
        if let Some(at) = self.quests.grounds.iter().position(|(name, _, _)| *name == place.name) {
            return at;
        }
        let (bounds, mesh) = square(&self.floor, &self.blocks, (place.at[0], place.at[1]));
        self.quests.grounds.push((place.name.clone(), bounds, mesh));
        self.quests.grounds.len() - 1
    }

    /// How many navmeshes the room has baked round its places.
    #[must_use]
    pub fn place_grounds(&self) -> usize {
        self.quests.grounds.len()
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
        isle.landed.as_ref().is_none_or(|landed| found.owner.as_ref().is_some_and(|owner| landed.contains(owner)))
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
    /// within `STAND_AGAIN`.
    pub(crate) fn keep_quests(&mut self) {
        let Some(node) = self.quests.node.as_deref() else { return };
        let (mut reached, mut near) = (Vec::new(), Vec::new());
        for (id, found) in &self.players {
            let at = [found.fighter.body.x, found.fighter.body.y];
            let now = found.character.quest_now();
            for (goal_at, goal) in found.character.goals_unmet() {
                let (Some(name), Some((quest, task))) = (goal.place.as_deref(), now) else { continue };
                if goal.node.as_deref() != Some(node) {
                    continue;
                }
                let mut here = self.quests.places.iter().filter(|place| place.name == name);
                match goal.kind {
                    GoalKind::Reach if here.any(|place| place.holds(at, 0.0)) => reached.push((*id, goal)),
                    GoalKind::Kill if !goal.spawn.is_empty() => {
                        let close =
                            here.find(|place| libm::hypot(at[0] - place.at[0], at[1] - place.at[1]) <= SPAWN_NEAR);
                        near.extend(close.map(|place| ([quest, task, goal_at], goal, place.clone())));
                    }
                    _ => {}
                }
            }
        }
        for (player, goal) in reached {
            let (Some(node), Some(place)) = (goal.node.as_deref(), goal.place.as_deref()) else { continue };
            self.tell_quest(player, &Event::Reach { node, place });
        }
        let (foes, clock, ground) = (&self.foes, self.clock, &mut self.quests);
        let standing = |ids: &[FighterId]| ids.iter().any(|id| foes.get(id).is_some_and(|foe| !foe.fighter.dead()));
        let fell: Vec<[usize; 3]> =
            ground.groups.iter().filter(|(_, ids)| !standing(ids)).map(|(key, _)| *key).collect();
        ground.groups.retain(|(_, ids)| standing(ids));
        ground.fallen.retain(|(key, at)| clock < at + STAND_AGAIN && !fell.contains(key));
        ground.fallen.extend(fell.into_iter().map(|key| (key, clock)));
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
        let members: Vec<(&'static FoeType, Rank)> =
            goal.spawn.iter().filter_map(|(name, rank)| named(name, rank)).collect();
        if members.is_empty() || self.living_foes() + members.len() > self.foes_most {
            return;
        }
        let ground = self.ground_of(place);
        let (mesh, reach) = (&self.quests.grounds[ground].2, place.radius);
        let Some(at) = held_near(mesh, &self.floor, place.at, reach) else { return };
        let seed = self.world_seed ^ QUEST_STREAM ^ (key[0] << 16 | key[1] << 8 | key[2]) as u64;
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
        for (nth, &(foe, rank)) in members.iter().enumerate() {
            let facing = start + TAU * nth as f64 / members.len() as f64;
            let wanted = [at[0] + libm::sin(facing) * SPREAD, at[1] - libm::cos(facing) * SPREAD];
            let spot = held_near(mesh, &self.floor, wanted, reach).unwrap_or(at);
            let (level, shield) = gird_of(seed, u32::try_from(nth).unwrap_or(0), self.quests.levels);
            post.members.push((foe.number, rank, spot, facing));
            post.girds.push((level, shield.filter(|_| !matches!(rank, Rank::Miniboss | Rank::Boss))));
        }
        self.garrison.push(post);
        let stood = self.garrison.len() - 1;
        self.stand_post(stood);
        self.quests.groups.push((key, self.garrison[stood].standing.clone()));
    }

    /// Where the first goal not yet met of a player's task with a place in this room stands: its middle and its
    /// reach; none when no such goal is here.
    #[must_use]
    pub fn quest_at(&self, player: PlayerId) -> Option<[f64; 3]> {
        let node = self.quests.node.as_deref()?;
        let found = self.players.get(&player)?;
        found.character.goals_unmet().find_map(|(_, goal)| {
            let name = goal.place.as_deref().filter(|_| goal.node.as_deref() == Some(node))?;
            let place = self.quests.places.iter().find(|place| place.name == name)?;
            Some([place.at[0], place.at[1], place.radius])
        })
    }
}

#[cfg(test)]
#[path = "quests_tests.rs"]
mod quests_tests;

#[cfg(test)]
#[path = "quest_grounds_tests.rs"]
mod quest_grounds_tests;
