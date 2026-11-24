//! A shared space on the server: its players and foes, every one a fighter by the combat rules. Each player's inputs
//! are taken in order and step their fighter one input a tick, never faster than the room's own clock; foes think and
//! step each tick; blows are judged as their defenders saw them. A node's room stands its fighters on the node's window
//! of the land and judges each player against its section every tick. It has no network and no clock: whatever hosts
//! the room hands it inputs and ticks, and sends out what it sees.

mod arts;
pub mod asks;
mod atheric;
pub mod battle;
pub mod boarding_hands;
mod bounties;
mod chain;
pub mod chart;
pub mod clash;
mod clears;
mod coast;
mod companions;
mod course;
pub mod crew;
pub mod deck;
mod deck_fight;
mod drops;
pub mod dungeon_ground;
mod dungeon_room;
pub mod encounter_plan;
pub mod encounters;
mod entrances;
pub mod fleet;
mod floor;
pub mod flotsam;
mod foes;
pub mod friendlies;
mod garrison;
mod guild_book;
mod guild_room;
mod happening;
pub mod harbour;
pub mod hostiles;
pub mod island;
mod judging;
mod landing;
mod left;
pub mod lore;
mod outpost;
mod outpost_boss;
pub mod patrol;
mod perks;
mod plates;
mod players;
mod power;
pub mod public;
mod quests;
mod recharge;
mod riding;
mod routes;
mod run;
pub mod sea;
pub mod sea_weather;
mod seeing;
pub mod ship_power;
pub mod sighting;
mod spells;
mod statuses;
mod steps;
mod story;
pub mod threat;
mod told;
pub mod winds;

pub use arts::{Cast, Casting};
pub use asks::{Asked, Grant, ResourceNode};
pub use companions::Companion;
pub use drops::{AMMO_REST_TICKS, DROP_TICKS, Drop, Dropped, VESTIGE_REST_TICKS};
pub use entrances::Entrance;
pub use floor::{Floor, standing_on};
pub use foes::{CLEAR_FOES, FOES_MOST, FoeSeen, NODE_FOES_MOST, SHIELD_SHIFT};
pub use guild_book::{GuildSeen, Guilds};
pub use judging::{Event, EventKind, How};
pub use outpost::{Errand, Material, OutpostAsk, PENDING, What, guild_key};
pub use perks::trim_of;
pub use plates::Plate;
pub use players::{
    CATCH_UP, DRESS_LIMIT, GEAR_EVERY_TICKS, GRACE, Input, MOVE_LIMIT, PLAYERS_MOST, PlayerId, Refused, SLACK_TICKS,
    Shown, SpawnAsk, VIEW_LAG, WAITING_LIMIT,
};
pub use power::{allowed_arms, arms_allowed, loadout_arms};
pub use run::{REVIVES, RunOf, elite_laid};
pub use spells::{BOLT, SpellSeen};
pub use steps::{StepSeen, way_between, way_length};

use combat::arms::{Arms, BARE_HANDS};
use combat::fighter::{FighterId, player};
use combat::judge::swing_blow;
use combat::shots::Line;
use combat::strike::struck;
use combat::{Fighter, Happening, Shot, Verdict, player_tick};
use foes::Foe;
use judging::{Check, Group, Pending, how_of_swing};
pub use land::sites::NodeKind;
#[cfg(test)]
use movement::standing;
use movement::{Block, Body, Mode};
use players::Player;
use reach::{Place, respawn_point};
pub use reach::{Section, Standing};
use std::borrow::Cow;
use std::collections::{BTreeMap, BTreeSet, VecDeque};

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

/// One shared space: its floor and course, where players stand, its section if it is a node's, its clock in ticks, its
/// players and foes in the order of their numbers, shots in flight, the blows waiting on their defenders' views, and
/// what happened since it was last asked.
#[derive(Debug)]
pub struct Room {
    /// The course, with the grid the movement rules find a body's near blocks by.
    pub(crate) blocks: movement::Blocks,
    pub(crate) floor: Floor,
    spawn_points: Vec<(f64, f64)>,
    section: Option<Section>,
    /// Whether players' asks for foes are taken: a course's room takes them, a node's only once told to.
    takes_foe_asks: bool,
    /// Whether players' Arts work here: everywhere but the prologue's wreck, where the player has none yet.
    arts: bool,
    /// Whether it plays the prologue's wreck (`story.rs`).
    story: bool,
    pub(crate) clock: u64,
    next_fighter: FighterId,
    /// How many players have joined: the next stands at the spawn this many turns on.
    joins: usize,
    pub(crate) players: BTreeMap<PlayerId, Player>,
    /// Each player's guild, as its host told it (`guild_book.rs`).
    pub(crate) guilds: guild_book::Guilds,
    pub(crate) foes: BTreeMap<FighterId, Foe>,
    /// The foes a page stood itself, whose phases call no one (`course.rs`).
    pub(crate) quiet: BTreeSet<FighterId>,
    /// Each with what its player loosed it with; a foe's with nothing.
    pub(crate) shots: Vec<(Shot, Option<power::Loosed>)>,
    pub(crate) pending: Vec<Pending>,
    pub(crate) groups: BTreeMap<u32, Group>,
    pub(crate) next_group: u32,
    pub(crate) events: Vec<judging::Event>,
    /// The fighter an Atheric's leap or burst being judged came from, which its events tell (`atheric.rs`).
    pub(crate) chain_from: Option<FighterId>,
    /// What the shot being judged was loosed with, whose perks it takes (`perk_on`); none outside a shot's judging.
    pub(crate) shot_loosed: Option<power::Loosed>,
    /// The verdicts (striker, defender) and telegraphed blows ended (foe, found no one, dodged perfectly) since the
    /// foes' brains were last told: one a player's leaving ends between ticks is told at the next.
    pub(crate) verdicts: Vec<(FighterId, FighterId, Verdict)>,
    pub(crate) ended_telegraphs: Vec<(FighterId, bool, bool)>,
    /// What the players asked of the foes, in turn, each with the level asked for.
    pub(crate) spawns: Vec<(PlayerId, SpawnAsk, u8)>,
    /// Swings begun this tick, for the foes' brains to see.
    pub(crate) swings: Vec<(FighterId, combat::fighter::Attack)>,
    /// Shots loosed this tick, by whom.
    pub(crate) loosed: Vec<FighterId>,
    /// The foes a swing settling now strikes: a burst it sets off passes them by, so one blow strikes a foe once.
    pub(crate) sweep: Vec<FighterId>,
    /// The balls that stopped since the last snapshot, each as its last segment and the point it left its gun.
    pub(crate) lines: Vec<Line>,
    /// What the foes share, how hot their fight runs, the routes they walk, the most it holds, and a node's garrison;
    /// the seed the players' loot is drawn from, and apart from it the seed the foes' chances and the camps are, since a
    /// player sees where a foe stands and what it does.
    pub(crate) board: ::foes::Board,
    pub(crate) director: ::foes::Director,
    pub(crate) nav: navmesh::NavMesh,
    /// Each foe's way over the navmesh, kept from one tick to the next.
    pub(crate) ways: BTreeMap<FighterId, navmesh::Way>,
    pub(crate) seed: u64,
    pub(crate) foes_most: usize,
    pub(crate) garrison: Vec<garrison::Post>,
    /// A mission's or a dungeon's garrison as one encounter, giving ground as it falls.
    pub(crate) encounter: Option<garrison::Encounter>,
    pub(crate) world_seed: u64,
    /// How many rolls the room has made for players, so no two share one, even in one tick.
    pub(crate) rolls: u64,
    /// Every fighter after each of the last ticks, to judge a player's blows as the player saw them.
    past: VecDeque<(u64, Vec<(FighterId, Fighter)>)>,
    /// A social space's counters, each serving its asks within reach (none for a room that is not one); the Test
    /// Ground's stall, which serves them all within reach; its resource nodes; and the Vestiges lying for its players.
    pub counters: Option<Vec<asks::Counter>>,
    pub(crate) stall: Option<[f64; 2]>,
    pub(crate) resource_nodes: Vec<ResourceNode>,
    /// A patrol's foes' sites, each with whether its group has stood there yet (`stands.rs`).
    pub(crate) foe_sites: Vec<([f64; 2], bool)>,
    /// Since when no player has come near each half-fallen patrol group, by its first foe as it stood (`stands.rs`).
    pub(crate) unvisited: BTreeMap<FighterId, u64>,
    pub(crate) drops: Vec<Drop>,
    pub(crate) spells: spells::Spells,
    /// The difficulty its voyage set out at; whether it is a patrol, whose nodes take turns (`patrol.rs`); and the
    /// nodes each account's character gathered here (in a patrol, this turn), kept past a player's leaving.
    pub(crate) difficulty: gear::Difficulty,
    pub(crate) patrol: bool,
    pub(crate) gathered: std::collections::BTreeMap<String, Vec<u8>>,
    /// A patrol's dungeons' entrances, or an Elite Dungeon's node's one (`entrances.rs`).
    pub(crate) entrances: Vec<entrances::Entrance>,
    /// What the gates know it as (`gear::gate`): none for a course, which no gate shuts.
    pub(crate) place: Option<gear::gate::Place>,
    /// A dungeon's run (`run.rs`): what its clear pays, its modifiers and its revives; none in any other room.
    pub(crate) run: Option<run::Run>,
    /// The players who struck (a blow, a shot or a cast) and have not since stood out of a patrol zone's landing or
    /// stood again: the landing's leave is not theirs (`landing.rs`).
    pub(crate) landing_struck: BTreeSet<FighterId>,
    /// The island it stands on, by its continent's id, for the feats it counts (`bounties.rs`); none at sea.
    pub(crate) island: Option<&'static str>,
    /// The content its drops come from, which their looks follow: a dungeon's, an Elite or Abyss Dungeon's or a sea
    /// dungeon's, else the world's (`gear::Source`).
    pub(crate) source: gear::Source,
    pub(crate) ashore: companions::Ashore,
    pub(crate) isle: Option<island::Isle>,
    /// A mission's, a dungeon's or a world boss's garrison's clear (`clears.rs`).
    pub(crate) clearing: Option<clears::Clearing>,
    /// The way a body faces as it stands at a spawn, and a dungeon's cache by its Reeve's post (`dungeon_room.rs`).
    pub(crate) facing: f64,
    pub(crate) cache: Option<dungeon_room::Cache>,
    /// A dungeon's ways out: its exit door's middle and its return portal's, at their feet; none in any other room.
    pub(crate) ways_out: Option<([f64; 2], [f64; 2])>,
    /// The minute it is, counted from the epoch (`set_minute`), whose day's wares and week's Shape it shows.
    pub minute: u64,
    pub shape_spots: Vec<[f64; 2]>,
    /// A zone's public events (`public/`); the foes the room moves itself, whose brains it leaves be; and the names
    /// some foes stand under in place of their type's.
    pub(crate) public: Option<public::Public>,
    pub(crate) inert: BTreeSet<FighterId>,
    pub(crate) names: BTreeMap<FighterId, &'static str>,
    /// The way each foe the room moves itself walks, kept from tick to tick.
    pub(crate) inert_ways: BTreeMap<FighterId, navmesh::Way>,
    /// Its node and places, and the groups the houses' roads stood here (`quests.rs`).
    pub(crate) quests: quests::QuestGround,
    /// An Elite Dungeon's seals and Court (`encounters.rs`); none in any other room.
    pub(crate) encounters: Option<Box<encounters::Encounters>>,
    /// A guild's outpost's errands, plot and War Horn's foe (`outpost.rs`); none in any other room.
    pub(crate) outpost: Option<Box<outpost::Outpost>>,
}

impl Room {
    /// An empty room on its floor and navmesh (`garrison.rs` bakes it), its blocks, its spawns and its section.
    pub(crate) fn on(
        floor: Floor,
        blocks: Vec<Block>,
        spawn_points: Vec<(f64, f64)>,
        section: Option<Section>,
        nav: navmesh::NavMesh,
    ) -> Self {
        Room {
            blocks: blocks.into(),
            floor,
            spawn_points,
            takes_foe_asks: section.is_none(),
            arts: true,
            story: false,
            section,
            clock: 0,
            next_fighter: 1,
            joins: 0,
            players: BTreeMap::new(),
            foes: BTreeMap::new(),
            quiet: BTreeSet::new(),
            shots: Vec::new(),
            pending: Vec::new(),
            groups: BTreeMap::new(),
            next_group: 1,
            events: Vec::new(),
            chain_from: None,
            shot_loosed: None,
            verdicts: Vec::new(),
            ended_telegraphs: Vec::new(),
            spawns: Vec::new(),
            swings: Vec::new(),
            loosed: Vec::new(),
            sweep: Vec::new(),
            lines: Vec::new(),
            board: ::foes::Board::default(),
            director: ::foes::Director::default(),
            nav,
            ways: BTreeMap::new(),
            seed: SEED,
            foes_most: FOES_MOST,
            garrison: Vec::new(),
            encounter: None,
            world_seed: SEED,
            rolls: 0,
            past: VecDeque::new(),
            counters: None,
            stall: None,
            resource_nodes: Vec::new(),
            foe_sites: Vec::new(),
            unvisited: BTreeMap::new(),
            drops: Vec::new(),
            spells: spells::Spells::default(),
            difficulty: gear::Difficulty::Normal,
            patrol: false,
            gathered: std::collections::BTreeMap::new(),
            entrances: Vec::new(),
            place: None,
            source: gear::Source::World,
            run: None,
            landing_struck: BTreeSet::new(),
            island: None,
            ashore: companions::Ashore::default(),
            isle: None,
            clearing: None,
            facing: core::f64::consts::PI,
            cache: None,
            ways_out: None,
            minute: 0,
            shape_spots: Vec::new(),
            public: None,
            inert: BTreeSet::new(),
            inert_ways: BTreeMap::new(),
            names: BTreeMap::new(),
            quests: quests::QuestGround::default(),
            guilds: guild_book::Guilds::default(),
            encounters: None,
            outpost: None,
        }
    }

    pub(crate) fn next_id(&mut self) -> FighterId {
        let id = self.next_fighter;
        self.next_fighter += 1;
        id
    }

    /// A body standing at a spawn: on the ground in a node's room, on the top of the block under it on a course.
    fn stand(&self, (x, y): (f64, f64)) -> Body {
        let body =
            if self.section.is_some() { standing_on(&self.floor, &self.blocks, x, y) } else { self.on_top(x, y) };
        Body { facing: self.facing, ..body }
    }

    /// Where a body that fell at (x, y) stands again: the section's spawn nearest it, or the room's spawn.
    pub(crate) fn stand_again(&self, x: f64, y: f64) -> Body {
        let near = self.section.as_ref().and_then(|section| respawn_point(section, x, y));
        let first = self.spawn_points.first().copied().unwrap_or((0.0, 0.0));
        self.stand(near.map_or(first, |[near_x, near_y]| (near_x, near_y)))
    }

    /// A new player, standing at the next spawn in turn with nothing drawn; none when the room is full.
    pub fn join(&mut self) -> Option<PlayerId> {
        if self.players.len() >= PLAYERS_MOST {
            return None;
        }
        let body = self.next_spawn();
        Some(self.join_standing(body))
    }

    /// A body standing at the next spawn in turn, as each join is stood.
    pub(crate) fn next_spawn(&mut self) -> Body {
        let turn = self.joins % self.spawn_points.len().max(1);
        self.joins += 1;
        self.stand(self.spawn_points.get(turn).copied().unwrap_or((0.0, 0.0)))
    }

    /// A new player standing as `body` stands, with nothing drawn; in the prologue's wreck room, armed for the story.
    pub(crate) fn join_standing(&mut self, body: Body) -> PlayerId {
        let id = self.next_id();
        let mut joined = Player::new(player(body, BARE_HANDS), self.clock, self.is_test_ground());
        if self.story {
            story::wake_for_story(&mut joined);
        }
        self.players.insert(id, joined);
        self.arrived(id);
        id
    }

    /// The player leaves: blows waiting on them are dropped, each telegraphed one counted as judged so it still ends.
    pub fn leave(&mut self, player: PlayerId) {
        self.open_chests_of(player);
        self.steps_left(player);
        self.part(player);
        self.drops.retain(|drop| drop.player != player);
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
        found.plate.menu = input.menu;
        found.shown_tick = found.shown_tick.max(input.seen.min(self.clock));
        if found.held {
            // Taken in order, as standing still, asking and casting nothing; its dress kept, sent only when it changes.
            let Input { sequence, seen, shown, arms, dress, .. } = input;
            input = Input { sequence, seen, shown, arms, dress, ..Input::default() };
        }
        // A dress waits its turn; one back to the dress shown clears whatever waited, so the last sent is the one shown.
        // One that does not read is refused, and the last that did is kept.
        if let Some(dress) = input.dress.take().filter(|dress| gear::cosmetics::read_dress(dress).is_some()) {
            found.dress_next = (dress != found.dress_sent).then_some(dress);
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
        self.step_players();
        self.spawn_asked();
        self.keep_patrol();
        self.keep_gathering();
        self.keep_companions();
        self.step_foes();
        self.keep_on_course();
        self.fly_shots();
        self.step_arts();
        self.judge_waiting();
        self.heal_linked();
        self.tell_brains();
        self.fall_with_callers();
        self.raise_the_dead();
        self.keep_garrison();
        self.keep_outpost();
        self.keep_encounters();
        self.keep_public();
        self.keep_cache();
        self.keep_quests();
        self.give_guilds();
        self.keep_steps();
        self.pick_up_drops();
        self.past.push_back((self.clock, self.fighters()));
        while self.past.len() > usize::try_from(VIEW_LAG).unwrap_or(24) + 1 {
            self.past.pop_front();
        }
    }

    /// Each player's inputs step their fighter, as many as the clock allows and CATCH_UP at most; a player whose
    /// inputs have stopped coming is stepped standing still once they fall a view's lag behind, so nothing they were
    /// doing (a dodge's safe stretch, a guard's parry window) outlasts its time while they are away. A body the section
    /// killed falls under its own weight (`lying_still`): its inputs are taken without steering it, and one asking to
    /// respawn, once the section allows, stands it at the spawn nearest where it fell. Then each player is judged
    /// against the section, from the height their feet last stood at.
    fn step_players(&mut self) {
        // The kept views are lent to each input, not copied: they stand aside while the players step.
        let past = std::mem::take(&mut self.past);
        let ids: Vec<PlayerId> = self.players.keys().copied().collect();
        for id in ids {
            if let Some(found) = self.players.get_mut(&id) {
                found.dress_in_turn(self.clock);
            }
            self.answer_due(id);
            let mut taken = 0;
            while taken < CATCH_UP {
                let Some((mut input, seen)) = self.next_input(id) else { break };
                taken += 1;
                // The room says who rides and who shows a horse, whatever the page says (`riding.rs`).
                riding::ride(self.players.get_mut(&id), &mut input, matches!(self.floor, Floor::Deck(_)));
                if let Some(asked) = input.ask.take() {
                    self.take_ask(id, asked);
                }
                self.ask_cast(id, input.cast.filter(|_| !input.intent.controls.mounted));
                // Nothing is fought from the saddle, as the page never asks it: no swing, guard, shot or aim.
                if input.intent.controls.mounted {
                    let pitch = input.intent.combat.pitch;
                    input.intent.combat = combat::CombatInput { pitch, ..combat::CombatInput::default() };
                }
                // A cast under way holds off a drink, so neither is lost to the other: this press and one kept from a
                // moment before alike; the page holds its press too.
                if let Some(found) = self.players.get_mut(&id).filter(|found| found.casting.releasing.is_some()) {
                    input.intent.combat.heal = false;
                    found.fighter.kept.heal = 0;
                }
                let kept = past.iter().find(|(kept, _)| *kept == seen).map(|(_, view)| view.as_slice());
                let view = kept.map_or_else(|| Cow::Owned(self.fighters()), Cow::Borrowed);
                let Some(found) = self.players.get_mut(&id) else { break };
                if let Standing::Dead { .. } = found.standing {
                    found.chain = chain::Chain::default();
                    found.shown = input.shown;
                    found.remember(seen);
                    let (lying, dead) = (players::lying_still(&found.fighter), found.armed(found.fighter));
                    found.fighter = player_tick(id, &dead, &lying, &view, &self.blocks, &self.floor).0;
                    if input.respawn && found.standing.may_respawn() {
                        let lain = found.fighter;
                        let body = self.stand_again(lain.body.x, lain.body.y);
                        let graced = self.clock + GRACE;
                        if let Some(found) = self.players.get_mut(&id) {
                            found.fighter = found.armed(player(body, lain.arms));
                            found.standing = Standing::Inside;
                            found.stood = body.z;
                            found.graced = graced;
                        }
                        self.tell(EventKind::Respawned, None, id, id, 0.0);
                    }
                    continue;
                }
                let held = found.fighter.holding(allowed_arms(Arms::from_code(input.arms), &found.character));
                let fighter = found.armed(held);
                let asked = &mut input.intent.combat.attack;
                *asked = asked.map(|asked| chain::stroke(found.chain, asked, &fighter, &view));
                let (next, happening) = player_tick(id, &fighter, &input.intent, &view, &self.blocks, &self.floor);
                (found.fighter, found.chain) = (next, found.chain.after(&next));
                found.shown = input.shown;
                found.remember(seen);
                if let Some(ask) = input.spawn.filter(|_| self.takes_foe_asks) {
                    self.spawns.push((id, ask, input.spawn_level));
                }
                self.happened(id, &next, happening, &view);
            }
            if taken == 0 {
                self.stand_stalled(id);
            }
            if let (Some(section), Some(found)) = (&self.section, self.players.get_mut(&id)) {
                let Body { x, y, z, mode, .. } = found.fighter.body;
                let at = Place { x, y, z, aloft: mode == Mode::Air };
                found.standing = found.standing.tick(section, at, found.stood);
                found.stood = reach::stood(found.stood, at);
            }
        }
        self.past = past;
    }
}

/// The seed every course's room draws its chances from, and every node's mixes with its id: one room plays the same
/// fight for the same inputs.
const SEED: u64 = 0x4f56_4552_4c4f_4f4b;
#[cfg(test)]
mod climb_tests;
#[cfg(test)]
mod course_tests;
#[cfg(test)]
mod faction_tests;
#[cfg(test)]
mod fair_tests;
#[cfg(test)]
mod fight_tests;
#[cfg(test)]
mod foe_tests;
#[cfg(test)]
mod gate_tests;
#[cfg(test)]
mod gear_tests;
#[cfg(test)]
mod loadout_tests;
#[cfg(test)]
mod measure_tests;
#[cfg(test)]
mod node_tests;
#[cfg(test)]
mod pace_tests;
#[cfg(test)]
mod patrol_tests;
#[cfg(test)]
mod perks_tests;
#[cfg(test)]
mod recharge_tests;
#[cfg(test)]
mod ring_tests;
#[cfg(test)]
mod room_tests;
#[cfg(test)]
mod spread_tests;
