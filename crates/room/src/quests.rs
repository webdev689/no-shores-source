//! The houses' roads in a room: its node and the places its file names, and each player's quest log told what they do
//! here (`gear::quests`): a place reached, checked each tick only for a player whose task waits on one in this node;
//! a foe's fall they struck; a spell cast; the node, or the sea island, arrived in. A kill goal's group stands at its
//! place for a player on it coming near, as a wave arrives, and again while the goal is unmet and none of it stands,
//! on a navmesh baked round that place as the room opens.

use crate::garrison::{Group, draws_of, gird_of, ground_middle, square, square_of};
use crate::players::Player;
use crate::{PlayerId, Room};
use ::foes::Rank;
use ::foes::roster::{FoeType, ROSTER};
use combat::fighter::FighterId;
use gear::quests::{Event, GoalDef, GoalKind, Kill, Place, RANKS, SPAWN_NEAR, quests};
use std::collections::BTreeMap;

/// The stream a road's groups draw their levels and shields from, apart from the garrison's.
const QUEST_STREAM: u64 = 0x7175_6573_7473;

/// A room's own for the roads: its node's id, the places its file names, its island's band of levels, and each kill
/// goal's group stood here, by the goal's quest, task and place in the task, with its foes. The node's own square,
/// once its places are known, and the square and navmesh round each place a group stands at; and the mesh each foe's
/// way was last found on, but the node's own (`routes.rs`).
#[derive(Debug, Default)]
pub(crate) struct QuestGround {
    pub node: Option<String>,
    pub places: Vec<Place>,
    pub levels: Option<(u8, u8)>,
    pub groups: Vec<([usize; 3], Vec<FighterId>)>,
    pub square: Option<navmesh::Bounds>,
    pub grounds: Vec<(navmesh::Bounds, navmesh::NavMesh)>,
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

/// Tells a player's quest log of an event; their gear goes out again when it counted.
fn tell_one(players: &mut BTreeMap<PlayerId, Player>, player: PlayerId, event: &Event<'_>) {
    if let Some(found) = players.get_mut(&player) {
        found.gear_changed |= found.character.tell(event);
    }
}

impl Room {
    /// The places of the node this room is, as its file names them; and round each a kill goal stands a group at, a
    /// navmesh of its own, as large as the node's own and baked as it is (`garrison::square`).
    pub fn set_places(&mut self, places: Vec<Place>) {
        self.quests.places = places;
        let (Some(node), Some(section)) = (self.quests.node.as_deref(), self.section.as_ref()) else { return };
        let goals = quests().quests.iter().flat_map(|quest| &quest.tasks).flat_map(|task| &task.goals);
        let spawned = goals.filter(|goal| goal.kind == GoalKind::Kill && !goal.spawn.is_empty());
        let mut names: Vec<&str> = Vec::new();
        for name in spawned.filter(|goal| goal.node.as_deref() == Some(node)).filter_map(|goal| goal.place.as_deref()) {
            if !names.contains(&name) {
                names.push(name);
            }
        }
        let first = self.spawn_points.first().copied().unwrap_or_default();
        self.quests.square = Some(square_of(&[], ground_middle(section, first)).0);
        let places = names.iter().filter_map(|name| self.quests.places.iter().find(|place| place.name == *name));
        let middles: Vec<(f64, f64)> = places.map(|place| (place.at[0], place.at[1])).collect();
        self.quests.grounds = middles.into_iter().map(|middle| square(&self.floor, &self.blocks, middle)).collect();
    }

    /// How many navmeshes the room baked round its places.
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

    /// A player arrived: in this node, and on this sea island.
    pub(crate) fn arrived(&mut self, player: PlayerId) {
        let island = self.island_kind();
        if let Some(node) = self.quests.node.as_deref() {
            tell_one(&mut self.players, player, &Event::Enter(node));
        }
        if let Some(island) = island {
            tell_one(&mut self.players, player, &Event::Land(island));
        }
    }

    /// A foe's fall a player struck: its roster's name and rank's number, where it fell.
    pub(crate) fn tell_kill(&mut self, player: PlayerId, foe: &str, rank: u8, at: [f64; 2]) {
        let island = self.island_kind();
        let (node, places) = (self.quests.node.as_deref(), self.quests.places.as_slice());
        tell_one(&mut self.players, player, &Event::Kill(Kill { node, at, places, foe, rank, island }));
    }

    /// Each tick: a player whose task waits on a place of this node standing within its reach reaches it; one on a
    /// kill goal with a group to stand, within `SPAWN_NEAR` of its place while none of that group stands, stands it.
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
                        near.extend(close.map(|place| ([quest, task, goal_at], goal, place.at)));
                    }
                    _ => {}
                }
            }
        }
        for (player, goal) in reached {
            let (Some(node), Some(place)) = (goal.node.as_deref(), goal.place.as_deref()) else { continue };
            self.tell_quest(player, &Event::Reach { node, place });
        }
        let foes = &self.foes;
        let standing = |ids: &[FighterId]| ids.iter().any(|id| foes.get(id).is_some_and(|foe| !foe.fighter.dead()));
        self.quests.groups.retain(|(_, ids)| standing(ids));
        for (key, goal, at) in near {
            if !self.quests.groups.iter().any(|(each, _)| *each == key) {
                self.stand_group(key, goal, at);
            }
        }
    }

    /// Stands a kill goal's group round its place on that place's own mesh, facing out and holding it, at the island's
    /// levels raised by the seas, as an arriving post that never stands again once it falls; none while the room's
    /// living foes leave no room, or the place's mesh cannot hold them.
    fn stand_group(&mut self, key: [usize; 3], goal: &'static GoalDef, at: [f64; 2]) {
        let members: Vec<(u8, Rank)> = goal
            .spawn
            .iter()
            .filter_map(|(name, rank)| named(name, rank))
            .map(|(foe, rank)| (foe.number, rank))
            .collect();
        let Some(section) = self.section.clone() else { return };
        if members.is_empty() || self.living_foes() + members.len() > self.foes_most {
            return;
        }
        let seed = self.world_seed ^ QUEST_STREAM ^ (key[0] << 16 | key[1] << 8 | key[2]) as u64;
        let (mut draws, mut beats) = (draws_of(seed), draws_of(seed));
        // It holds its place, walking no beat, as a group at the farthest post does.
        let group = Group { members, leads: false, farthest: true };
        let Some(mut post) = self.post_at(&group, (at[0], at[1]), (&section, &[]), (&mut draws, &mut beats)) else {
            return;
        };
        post.arrival = true;
        for (nth, &(_, rank, _, _)) in post.members.iter().enumerate() {
            let (level, shield) = gird_of(seed, u32::try_from(nth).unwrap_or(0), self.quests.levels);
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
