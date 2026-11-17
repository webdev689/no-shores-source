//! A shared space on the server: its players and foes, every one a fighter by the combat rules. Each player's inputs
//! are taken in order and step their fighter one input a tick, never faster than the room's own clock; foes think and
//! step each tick; blows are judged as their defenders saw them. A node's room stands its fighters on the node's window
//! of the land and judges each player against its section every tick. It has no network and no clock: whatever hosts
//! the room hands it inputs and ticks, and sends out what it sees. See the Server note in the bible.

mod foes;
mod judging;
mod players;
pub mod sea;

pub use foes::{CLEAR_FOES, FOES_MOST};
pub use judging::{Event, EventKind, How, how_of};
pub use players::{
    CATCH_UP, DRESS_LIMIT, GRACE, Input, MOVE_LIMIT, PLAYERS_MOST, PlayerId, Refused, SLACK_TICKS, Shown, VIEW_LAG,
    WAITING_LIMIT,
};

use combat::arms::{Arms, BARE_HANDS};
use combat::fighter::{Action, FighterId, player};
use combat::judge::swing_blow;
use combat::strike::struck;
use combat::tuning::{FOE_GONE, RESPAWN};
use combat::{Fighter, Happening, Shot, Verdict, player_tick};
use judging::{Check, Group, Pending, how_of_swing};
use land::ground::Ground;
use movement::blocks::ground_at;
use movement::{Block, Body, Terrain, standing};
use players::Player;
use reach::respawn_point;
pub use reach::{Section, Standing};
use std::collections::{BTreeMap, VecDeque};

/// The ground a room's fighters stand on: open ground at 0 m, or a node's window of the land.
#[derive(Clone, Debug, PartialEq)]
pub enum Floor {
    Flat,
    Land(Box<Ground>),
}

impl Terrain for Floor {
    fn height_at(&self, x: f64, y: f64) -> f64 {
        match self {
            Floor::Flat => 0.0,
            Floor::Land(ground) => ground.height_at(x, y),
        }
    }
}

/// A body standing at (x, y) on the floor and the blocks: its feet on the ground there, or on a block's top within
/// a step of it.
#[must_use]
pub fn standing_on(floor: &Floor, blocks: &[Block], x: f64, y: f64) -> Body {
    Body { z: ground_at(blocks, floor, x, y, floor.height_at(x, y)), ..standing(x, y) }
}

/// A player as the room last stepped them: their fighter, where it stands with the room's section, what their figure
/// showed with it, and the number of their last input it took.
#[derive(Clone, Debug, PartialEq)]
pub struct Seen {
    pub player: PlayerId,
    pub fighter: Fighter,
    pub standing: Standing,
    pub shown: Shown,
    pub acknowledged: u32,
}

/// A foe as the room keeps it: its fighter, its kind's number and its brain.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Foe {
    pub fighter: Fighter,
    pub kind: u8,
    pub brain: ::foes::Brain,
}

/// A foe as the room last stepped it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FoeSeen {
    pub foe: FighterId,
    pub kind: u8,
    pub fighter: Fighter,
}

/// One shared space: its floor and course, where players stand, its section if it is a node's, its clock in ticks, its
/// players and foes in the order of their numbers, shots in flight, the blows waiting on their defenders' views, and
/// what happened since it was last asked.
#[derive(Debug)]
pub struct Room {
    pub(crate) blocks: Vec<Block>,
    pub(crate) floor: Floor,
    spawn_points: Vec<(f64, f64)>,
    section: Option<Section>,
    pub(crate) clock: u64,
    next_fighter: FighterId,
    pub(crate) players: BTreeMap<PlayerId, Player>,
    pub(crate) foes: BTreeMap<FighterId, Foe>,
    pub(crate) shots: Vec<Shot>,
    pub(crate) pending: Vec<Pending>,
    pub(crate) groups: BTreeMap<u32, Group>,
    pub(crate) next_group: u32,
    pub(crate) events: Vec<judging::Event>,
    /// This tick's verdicts (striker, defender) and telegraphed blows ended (foe, found no one, dodged perfectly), for
    /// the foes' brains.
    pub(crate) verdicts: Vec<(FighterId, FighterId, Verdict)>,
    pub(crate) ended_telegraphs: Vec<(FighterId, bool, bool)>,
    /// Foes the players asked to stand before them: (player, kind).
    pub(crate) spawns: Vec<(PlayerId, u8)>,
    /// Swings begun this tick, for the foes' brains to see.
    pub(crate) swings: Vec<(FighterId, combat::fighter::Attack)>,
    /// Shots loosed this tick, by whom.
    pub(crate) loosed: Vec<FighterId>,
    /// The balls fired since the last snapshot, each as its whole line: from where it left to where it stopped, in one
    /// tick of its velocity.
    pub(crate) lines: Vec<Shot>,
    /// What the foes share, the routes they walk, and the seed their chances are drawn from.
    pub(crate) board: ::foes::Board,
    pub(crate) nav: navmesh::NavMesh,
    pub(crate) seed: u64,
    /// Every fighter after each of the last ticks, to judge a player's blows as the player saw them.
    past: VecDeque<(u64, Vec<(FighterId, Fighter)>)>,
}

impl Room {
    /// An empty room on a course of blocks on open ground, where players stand at `spawn` (x, y) when they join. Its
    /// navmesh is baked over the course and open ground around it.
    #[must_use]
    pub fn new(blocks: Vec<Block>, spawn: (f64, f64)) -> Self {
        Self::on(Floor::Flat, blocks, vec![spawn], None)
    }

    /// An empty node's room: its floor, the blocks standing on it, and its section, whose spawns players join at in
    /// turn and come back to.
    #[must_use]
    pub fn node(floor: Floor, blocks: Vec<Block>, section: Section) -> Self {
        let spawns = section.spawns.iter().map(|&[x, y]| (x, y)).collect();
        Self::on(floor, blocks, spawns, Some(section))
    }

    fn on(floor: Floor, blocks: Vec<Block>, spawn_points: Vec<(f64, f64)>, section: Option<Section>) -> Self {
        let first = spawn_points.first().copied().unwrap_or((0.0, 0.0));
        // A node's room stands no foes yet, so it bakes no navmesh over its city's boxes, which would cost more memory
        // than a room has: an empty one round its first spawn.
        let walked: &[Block] = if section.is_some() { &[] } else { &blocks };
        let nav = navmesh::NavMesh::bake(walked, ground_around(walked, first), &navmesh::AGENT);
        Room {
            blocks,
            floor,
            spawn_points,
            section,
            clock: 0,
            next_fighter: 1,
            players: BTreeMap::new(),
            foes: BTreeMap::new(),
            shots: Vec::new(),
            pending: Vec::new(),
            groups: BTreeMap::new(),
            next_group: 1,
            events: Vec::new(),
            verdicts: Vec::new(),
            ended_telegraphs: Vec::new(),
            spawns: Vec::new(),
            swings: Vec::new(),
            loosed: Vec::new(),
            lines: Vec::new(),
            board: ::foes::Board::default(),
            nav,
            seed: SEED,
            past: VecDeque::new(),
        }
    }

    pub(crate) fn next_id(&mut self) -> FighterId {
        let id = self.next_fighter;
        self.next_fighter += 1;
        id
    }

    /// A body standing at a spawn: on the ground in a node's room, at 0 m on a course.
    fn stand(&self, (x, y): (f64, f64)) -> Body {
        if self.section.is_some() { standing_on(&self.floor, &self.blocks, x, y) } else { standing(x, y) }
    }

    /// Where a body that fell at (x, y) stands again: the section's spawn nearest it, or the room's spawn.
    fn stand_again(&self, x: f64, y: f64) -> Body {
        let near = self.section.as_ref().and_then(|section| respawn_point(section, x, y));
        let first = self.spawn_points.first().copied().unwrap_or((0.0, 0.0));
        self.stand(near.map_or(first, |[near_x, near_y]| (near_x, near_y)))
    }

    /// A new player, standing at the next spawn in turn with nothing drawn; none when the room is full.
    pub fn join(&mut self) -> Option<PlayerId> {
        if self.players.len() >= PLAYERS_MOST {
            return None;
        }
        let id = self.next_id();
        let turn = (id as usize).saturating_sub(1) % self.spawn_points.len().max(1);
        let spawn = self.spawn_points.get(turn).copied().unwrap_or((0.0, 0.0));
        let fighter = player(self.stand(spawn), BARE_HANDS);
        self.players.insert(id, Player::new(fighter, self.clock));
        Some(id)
    }

    /// The player leaves: blows waiting on them are dropped, each telegraphed one counted as judged so it still ends.
    pub fn leave(&mut self, player: PlayerId) {
        self.players.remove(&player);
        let (gone, kept): (Vec<Pending>, Vec<Pending>) =
            std::mem::take(&mut self.pending).into_iter().partition(|pending| pending.defender == player);
        self.pending = kept;
        for pending in &gone {
            self.group_judged(pending, None);
        }
    }

    /// The player's input, which must follow their last. Its intent and look wait for the room's next tick; a new
    /// dress is taken at once.
    pub fn input(&mut self, player: PlayerId, mut input: Input) -> Result<(), Refused> {
        let found = self.players.get_mut(&player).ok_or(Refused::NoSuchPlayer)?;
        let expected = found.received.wrapping_add(1);
        if input.sequence != expected {
            return Err(Refused::OutOfOrder { expected, got: input.sequence });
        }
        if !input.fits() {
            return Err(Refused::BadLook);
        }
        if found.waiting.len() >= WAITING_LIMIT {
            // Let go of the oldest as though taken: the order holds, and the player is never further behind than this.
            found.waiting.pop_front();
            found.acknowledged = found.acknowledged.wrapping_add(1);
        }
        found.received = input.sequence;
        if let Some(dress) = input.dress.take()
            && dress != found.dress
        {
            found.dress_next = Some(dress);
        }
        // A player never begins a telegraphed blow.
        input.intent.combat.telegraph = None;
        found.waiting.push_back(input);
        Ok(())
    }

    /// One tick of the room's clock: each player's waiting inputs step their fighter in order, as many as the clock
    /// allows; the foes think and step; shots fly; blows waiting on a player's view are judged; the dead stand again
    /// or are gone; and every fighter is kept for judging later blows as players saw them.
    pub fn tick(&mut self) {
        self.clock += 1;
        self.verdicts.clear();
        self.ended_telegraphs.clear();
        self.step_players();
        self.spawn_asked();
        self.step_foes();
        self.fly_shots();
        self.judge_waiting();
        self.tell_brains();
        self.raise_the_dead();
        self.past.push_back((self.clock, self.fighters()));
        while self.past.len() > usize::try_from(VIEW_LAG).unwrap_or(24) + 1 {
            self.past.pop_front();
        }
    }

    /// Each player's inputs step their fighter, as many as the clock allows and CATCH_UP at most; a player whose
    /// inputs have stopped coming is stepped standing still once they fall a view's lag behind, so nothing they were
    /// doing (a dodge's safe stretch, a guard's parry window) outlasts its time while they are away. A body the section
    /// killed lies still: its inputs are taken without moving it, and one asking to respawn, once the section allows,
    /// stands it at the spawn nearest where it fell. Then each player is judged against the section.
    fn step_players(&mut self) {
        let ids: Vec<PlayerId> = self.players.keys().copied().collect();
        for id in ids {
            self.dress_in_turn(id);
            let mut taken = 0;
            while taken < CATCH_UP {
                let Some((input, seen)) = self.next_input(id) else { break };
                taken += 1;
                let view = self.view_at(seen);
                let Some(found) = self.players.get_mut(&id) else { break };
                if let Standing::Dead { .. } = found.standing {
                    found.shown = input.shown;
                    found.remember(seen);
                    if input.respawn && found.standing.may_respawn() {
                        let fallen = found.fighter;
                        let body = self.stand_again(fallen.body.x, fallen.body.y);
                        let graced = self.clock + GRACE;
                        if let Some(found) = self.players.get_mut(&id) {
                            found.fighter = player(body, fallen.arms);
                            found.standing = Standing::Inside;
                            found.graced = graced;
                        }
                    }
                    continue;
                }
                let fighter = found.fighter.holding(Arms::from_code(input.arms));
                let (next, happening) = player_tick(id, &fighter, &input.intent, &view, &self.blocks, &self.floor);
                found.fighter = next;
                found.shown = input.shown;
                found.remember(seen);
                if let Some(kind) = input.spawn.filter(|_| self.section.is_none()) {
                    self.spawns.push((id, kind));
                }
                self.happened(id, &next, happening, &view);
            }
            if taken == 0 {
                self.stand_stalled(id);
            }
            if let (Some(section), Some(found)) = (&self.section, self.players.get_mut(&id)) {
                let body = found.fighter.body;
                found.standing = found.standing.tick(section, body.x, body.y);
            }
        }
    }

    /// A player a view's lag behind with no input to take is stepped a tick standing still, looking where they aim.
    fn stand_stalled(&mut self, id: PlayerId) {
        let clock = self.clock;
        let Some(found) = self.players.get_mut(&id) else { return };
        if found.stepped + VIEW_LAG >= clock - found.joined || matches!(found.standing, Standing::Dead { .. }) {
            return;
        }
        let standing = combat::Intent {
            controls: movement::Controls { yaw: found.fighter.aim, ..movement::Controls::default() },
            combat: combat::CombatInput::default(),
        };
        let view = self.fighters();
        let Some(found) = self.players.get_mut(&id) else { return };
        found.stepped += 1;
        let (next, happening) = player_tick(id, &found.fighter, &standing, &view, &self.blocks, &self.floor);
        found.fighter = next;
        self.happened(id, &next, happening, &view);
    }

    /// A dress waiting its turn is taken at once the first time, then once DRESS_EVERY ticks have passed since the
    /// last change.
    fn dress_in_turn(&mut self, id: PlayerId) {
        let clock = self.clock;
        let Some(found) = self.players.get_mut(&id) else { return };
        if found.dressed_at.is_some_and(|at| clock < at + players::DRESS_EVERY) {
            return;
        }
        if let Some(dress) = found.dress_next.take() {
            found.dress = dress;
            found.dress_changed = true;
            found.dressed_at = Some(clock);
        }
    }

    /// The player's next input the clock allows, and the room tick it was seeing (never ahead of the clock, never
    /// behind the last nor more than SEEN_STEP past it, never further back than a view may lag).
    fn next_input(&mut self, id: PlayerId) -> Option<(Input, u64)> {
        let clock = self.clock;
        let found = self.players.get_mut(&id)?;
        if found.stepped >= clock - found.joined + SLACK_TICKS {
            return None;
        }
        let input = found.waiting.pop_front()?;
        found.stepped += 1;
        found.acknowledged = found.acknowledged.wrapping_add(1);
        let seen = input
            .seen
            .min(clock)
            .min(found.seen + players::SEEN_STEP)
            .max(found.seen)
            .max(clock.saturating_sub(VIEW_LAG));
        Some((input, seen))
    }

    /// What a fighter's tick set off, among `view`, everyone as it saw them: a blow landing on whoever it reaches, a
    /// shot leaving, a feint.
    pub(crate) fn happened(
        &mut self,
        id: FighterId,
        fighter: &Fighter,
        happening: Option<Happening>,
        view: &[(FighterId, Fighter)],
    ) {
        if matches!(happening, Some(Happening::Swung(_) | Happening::Loosed(_)))
            && let Some(found) = self.players.get_mut(&id)
        {
            // Striking first ends the grace a player stood again with.
            found.graced = 0;
        }
        match happening {
            Some(Happening::Swung(attack)) => self.swings.push((id, attack)),
            Some(Happening::Struck(attack)) => {
                for defender in struck(id, fighter, &attack, view, &self.blocks) {
                    let blow = swing_blow(id, fighter, &attack, defender);
                    let how = how_of_swing(&attack, defender);
                    if self.players.contains_key(&defender) {
                        let check = Check::Swing { striker: Box::new(*fighter), attack };
                        self.pending.push(Pending { blow, how, defender, tick: self.clock, check });
                    } else if let Some(then) = self.as_seen(defender, view) {
                        self.judge_now(&blow, how, defender, &then);
                    }
                }
            }
            Some(Happening::Loosed(shot)) => {
                let shot = Shot { owner: id, ..shot };
                self.loosed.push(id);
                // A player's ball reaches its mark at once: judged among the foes as the player's screen showed them.
                if self.players.contains_key(&id) && combat::shots::shot_numbers(shot.ranged).0 <= 0.0 {
                    let stop = self.shoot_seen(&shot, view);
                    self.lines.push(combat::shots::line_of(&shot, stop));
                } else {
                    self.shots.push(shot);
                }
            }
            Some(Happening::Feinted(_)) => self.tell(EventKind::Feinted, None, id, id, 0.0),
            _ => {}
        }
    }

    /// A player dead long enough stands again at the spawn nearest where they fell, whole; a foe dead long enough is
    /// gone.
    fn raise_the_dead(&mut self) {
        let mut raised = Vec::new();
        let fallen: Vec<(PlayerId, Fighter)> = self
            .players
            .iter()
            .filter(|(_, found)| matches!(found.fighter.action, Action::Dead { elapsed } if elapsed >= RESPAWN))
            .map(|(id, found)| (*id, found.fighter))
            .collect();
        for (id, fighter) in fallen {
            let body = self.stand_again(fighter.body.x, fighter.body.y);
            let graced = self.clock + GRACE;
            if let Some(found) = self.players.get_mut(&id) {
                found.fighter = player(body, fighter.arms);
                found.graced = graced;
                raised.push(id);
            }
        }
        for id in raised {
            self.tell(EventKind::Respawned, None, id, id, 0.0);
        }
        let gone: Vec<FighterId> = self
            .foes
            .iter()
            .filter(|(_, foe)| matches!(foe.fighter.action, Action::Dead { elapsed } if elapsed >= FOE_GONE))
            .map(|(id, _)| *id)
            .collect();
        for id in gone {
            self.foes.remove(&id);
            self.board.forget(id);
        }
    }

    /// Every fighter now, players then foes, each in the order of their numbers.
    #[must_use]
    pub fn fighters(&self) -> Vec<(FighterId, Fighter)> {
        let players = self.players.iter().map(|(id, found)| (*id, found.fighter));
        players.chain(self.foes.iter().map(|(id, foe)| (*id, foe.fighter))).collect()
    }

    /// Every fighter as it stood after the tick `tick`, while the room still keeps it; else as it is now.
    pub(crate) fn view_at(&self, tick: u64) -> Vec<(FighterId, Fighter)> {
        self.past
            .iter()
            .find(|(kept, _)| *kept == tick)
            .map_or_else(|| self.fighters(), |(_, fighters)| fighters.clone())
    }

    /// A foe a player's blow reached, as the player's screen showed it (`view`): where it stood then, but guarding,
    /// dodging and staggered as it is now, so a foe's answers count the same whatever the player's lag.
    pub(crate) fn as_seen(&self, foe: FighterId, view: &[(FighterId, Fighter)]) -> Option<Fighter> {
        let then = view.iter().find(|(other, _)| *other == foe).map(|(_, then)| then.body)?;
        self.fighter(foe).map(|now| Fighter { body: then, ..*now })
    }

    pub(crate) fn fighter(&self, id: FighterId) -> Option<&Fighter> {
        self.players.get(&id).map(|found| &found.fighter).or_else(|| self.foes.get(&id).map(|foe| &foe.fighter))
    }

    pub(crate) fn set_fighter(&mut self, id: FighterId, fighter: Fighter) {
        if let Some(found) = self.players.get_mut(&id) {
            found.fighter = fighter;
        } else if let Some(foe) = self.foes.get_mut(&id) {
            foe.fighter = fighter;
        }
    }

    /// Every player as the room last stepped them, in the order of their numbers.
    pub fn seen(&self) -> impl Iterator<Item = Seen> + '_ {
        self.players.iter().map(|(&player, found)| Seen {
            player,
            fighter: found.fighter,
            standing: found.standing,
            shown: found.shown.clone(),
            acknowledged: found.acknowledged,
        })
    }

    /// Every foe as the room last stepped it, in the order of their numbers.
    pub fn foes_seen(&self) -> impl Iterator<Item = FoeSeen> + '_ {
        self.foes.iter().map(|(&foe, found)| FoeSeen { foe, kind: found.kind, fighter: found.fighter })
    }

    /// The shots in flight.
    #[must_use]
    pub fn shots(&self) -> &[Shot] {
        &self.shots
    }

    /// The balls fired since this was last asked, each as its whole line, to send to everyone once so every screen
    /// draws its tracer, however many ticks a snapshot follows.
    pub fn take_lines(&mut self) -> Vec<Shot> {
        std::mem::take(&mut self.lines)
    }

    /// What happened in the fight since this was last asked, to send to everyone once.
    pub fn take_events(&mut self) -> Vec<Event> {
        std::mem::take(&mut self.events)
    }

    /// Every player's dress, for one who joins; players who have sent none are left out.
    pub fn dresses(&self) -> impl Iterator<Item = (PlayerId, &str)> + '_ {
        self.players
            .iter()
            .filter(|(_, found)| !found.dress.is_empty())
            .map(|(&player, found)| (player, found.dress.as_str()))
    }

    /// The dresses that changed since this was last asked, to send to everyone once.
    pub fn take_dress_changes(&mut self) -> Vec<(PlayerId, String)> {
        let changed = self.players.iter_mut().filter(|(_, found)| found.dress_changed);
        changed
            .map(|(&player, found)| {
                found.dress_changed = false;
                (player, found.dress.clone())
            })
            .collect()
    }

    #[must_use]
    pub fn clock(&self) -> u64 {
        self.clock
    }
}

/// The seed every room's chances are drawn from: one room plays the same fight for the same inputs.
const SEED: u64 = 0x4f56_4552_4c4f_4f4b;
/// Open ground a navmesh covers beyond the course's blocks and the spawn, each way.
const GROUND_AROUND: f64 = 30.0;

/// The ground a room's navmesh covers: the course's blocks and the spawn, and open ground around them.
fn ground_around(blocks: &[Block], spawn: (f64, f64)) -> navmesh::Bounds {
    let start = navmesh::Bounds { min_x: spawn.0, min_y: spawn.1, max_x: spawn.0, max_y: spawn.1 };
    let covered = blocks.iter().fold(start, |bounds, block| navmesh::Bounds {
        min_x: bounds.min_x.min(block.min_x),
        min_y: bounds.min_y.min(block.min_y),
        max_x: bounds.max_x.max(block.max_x),
        max_y: bounds.max_y.max(block.max_y),
    });
    navmesh::Bounds {
        min_x: covered.min_x - GROUND_AROUND,
        min_y: covered.min_y - GROUND_AROUND,
        max_x: covered.max_x + GROUND_AROUND,
        max_y: covered.max_y + GROUND_AROUND,
    }
}

#[cfg(test)]
#[path = "room_tests.rs"]
mod room_tests;

#[cfg(test)]
#[path = "fight_tests.rs"]
mod fight_tests;

#[cfg(test)]
#[path = "foe_tests.rs"]
mod foe_tests;

#[cfg(test)]
#[path = "fair_tests.rs"]
mod fair_tests;

#[cfg(test)]
#[path = "node_tests.rs"]
mod node_tests;
