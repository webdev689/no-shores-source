//! A shared space on the server: the players in it, each player's inputs taken in order, and their bodies stepped by
//! the movement rules, one input a tick and never faster than the room's own clock. A node's room stands its bodies on
//! the node's window of the land and judges each against its section every tick. It has no network and no clock:
//! whatever hosts the room hands it inputs and ticks, and sends out what it sees. See the Server note in the bible.

pub mod sea;

use land::ground::Ground;
use movement::blocks::ground_at;
use movement::{Block, Body, Controls, TICK_SECONDS, Terrain, standing, step_body};
use reach::respawn_point;
pub use reach::{Section, Standing};
use std::collections::{BTreeMap, VecDeque};

/// A player's number in a room, never reused while the room lives.
pub type PlayerId = u32;

/// How many ticks of inputs a player may run ahead of the room's clock, to ride out a network's jitter.
pub const SLACK_TICKS: u64 = 6;
/// How many inputs a player may have waiting; past that, more are refused.
pub const WAITING_LIMIT: usize = 30;
/// The most steps a player takes in one tick: a backlog after a stall drains at twice real time, never faster.
pub const STEPS_A_TICK: u64 = 2;
/// The most ticks of steps a player may hold in hand: one who sends nothing for a while banks no more than this, so
/// none moves faster than real time for more than a moment.
pub const BANK_TICKS: u64 = 60;
/// The longest move name and dress, in bytes, a player may send.
pub const MOVE_LIMIT: usize = 40;
pub const DRESS_LIMIT: usize = 4096;

/// Why an input was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Refused {
    NoSuchPlayer,
    /// Inputs are numbered 1, 2, 3… for each player, and must arrive in that order.
    OutOfOrder {
        expected: u32,
        got: u32,
    },
    TooManyWaiting,
    /// A move name that is not lowercase letters, digits and underscores, or a move or dress past its limit.
    BadLook,
}

/// What a player's figure shows, as their own browser draws it: the forge's move, its frame, and the way it faces.
/// The room decides nothing about it; it passes it on with the body it goes with.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Shown {
    pub anim: String,
    pub frame: u16,
    pub facing: f64,
}

/// One input from a player: its number, one tick's controls, what their figure shows, their dress when it changed
/// (as the browser writes it; the room only carries it), and whether they ask to respawn.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Input {
    pub sequence: u32,
    pub controls: Controls,
    pub shown: Shown,
    pub dress: Option<String>,
    pub respawn: bool,
}

/// The ground a room's bodies stand on: open ground at 0 m, or a window of the land.
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

#[derive(Debug)]
struct Waiting {
    sequence: u32,
    controls: Controls,
    shown: Shown,
    respawn: bool,
}

#[derive(Debug)]
struct Player {
    body: Body,
    standing: Standing,
    shown: Shown,
    dress: String,
    dress_changed: bool,
    /// The room's clock when the player joined, and how many of their inputs have stepped their body since.
    joined: u64,
    stepped: u64,
    /// The number of the last input received, and of the last that stepped the body.
    received: u32,
    acknowledged: u32,
    waiting: VecDeque<Waiting>,
}

/// A player as the room last stepped them: their body, where it stands with the room's section, what their figure
/// showed with it, and the number of their last input it took.
#[derive(Clone, Debug, PartialEq)]
pub struct Seen {
    pub player: PlayerId,
    pub body: Body,
    pub standing: Standing,
    pub shown: Shown,
    pub acknowledged: u32,
}

/// One shared space: its floor and blocks, its section if it has one, its clock in ticks, and its players in the
/// order of their numbers.
#[derive(Debug)]
pub struct Room {
    blocks: Vec<Block>,
    floor: Floor,
    spawns: Vec<(f64, f64)>,
    section: Option<Section>,
    clock: u64,
    next_player: PlayerId,
    players: BTreeMap<PlayerId, Player>,
}

impl Room {
    /// An empty room on a course of blocks on open ground, where players stand at `spawn` (x, y) when they join and
    /// go where they will.
    #[must_use]
    pub fn new(blocks: Vec<Block>, spawn: (f64, f64)) -> Self {
        Room {
            blocks,
            floor: Floor::Flat,
            spawns: vec![spawn],
            section: None,
            clock: 0,
            next_player: 1,
            players: BTreeMap::new(),
        }
    }

    /// An empty node's room: its floor, the blocks standing on it, and its section, whose spawns players join at in
    /// turn and come back to.
    #[must_use]
    pub fn node(floor: Floor, blocks: Vec<Block>, section: Section) -> Self {
        let spawns = section.spawns.iter().map(|&[x, y]| (x, y)).collect();
        Room { blocks, floor, spawns, section: Some(section), clock: 0, next_player: 1, players: BTreeMap::new() }
    }

    /// A body standing at a spawn: on the ground in a node's room, at 0 m on a course.
    fn stand(&self, (x, y): (f64, f64)) -> Body {
        if self.section.is_some() { standing_on(&self.floor, &self.blocks, x, y) } else { standing(x, y) }
    }

    /// A new player, standing at the next spawn in turn.
    pub fn join(&mut self) -> PlayerId {
        let player = self.next_player;
        self.next_player += 1;
        let turn = (player as usize - 1) % self.spawns.len().max(1);
        let body = self.spawns.get(turn).map_or_else(|| standing(0.0, 0.0), |&spawn| self.stand(spawn));
        let joined = self.clock;
        let waiting = VecDeque::new();
        let (shown, dress) = (Shown::default(), String::new());
        let entry = Player {
            body,
            standing: Standing::Inside,
            shown,
            dress,
            dress_changed: false,
            joined,
            stepped: 0,
            received: 0,
            acknowledged: 0,
            waiting,
        };
        self.players.insert(player, entry);
        player
    }

    pub fn leave(&mut self, player: PlayerId) {
        self.players.remove(&player);
    }

    /// The player's input, which must follow their last. Its controls, look and respawn wait for the room's next tick;
    /// a new dress is taken at once.
    pub fn input(&mut self, player: PlayerId, input: Input) -> Result<(), Refused> {
        let found = self.players.get_mut(&player).ok_or(Refused::NoSuchPlayer)?;
        let expected = found.received.wrapping_add(1);
        if input.sequence != expected {
            return Err(Refused::OutOfOrder { expected, got: input.sequence });
        }
        if found.waiting.len() >= WAITING_LIMIT {
            // Dropped, but counted, so the next input still follows it and the player stays.
            found.received = input.sequence;
            return Err(Refused::TooManyWaiting);
        }
        let named =
            input.shown.anim.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_');
        let dress_fits = input.dress.as_ref().is_none_or(|dress| dress.len() <= DRESS_LIMIT);
        if !named || input.shown.anim.len() > MOVE_LIMIT || !dress_fits {
            return Err(Refused::BadLook);
        }
        found.received = input.sequence;
        let waiting =
            Waiting { sequence: input.sequence, controls: input.controls, shown: input.shown, respawn: input.respawn };
        found.waiting.push_back(waiting);
        if let Some(dress) = input.dress
            && dress != found.dress
        {
            found.dress = dress;
            found.dress_changed = true;
        }
        Ok(())
    }

    /// One tick of the room's clock. Each player's waiting inputs step their body in order, one step each, as many as
    /// the clock allows: no more than the ticks since they joined and the slack, no more than `STEPS_A_TICK` at once,
    /// and with no more than `BANK_TICKS` saved up from ticks they sent nothing. A dead body is still: its inputs are
    /// taken without moving it, and one asking to respawn, once the section allows, stands it at the spawn nearest
    /// where it died. Then each body is judged against the section.
    pub fn tick(&mut self) {
        self.clock += 1;
        let Room { blocks, floor, section, clock, players, .. } = self;
        for player in players.values_mut() {
            let owed = *clock - player.joined + SLACK_TICKS;
            player.stepped = player.stepped.max(owed.saturating_sub(BANK_TICKS));
            let allowed = owed.min(player.stepped + STEPS_A_TICK);
            while player.stepped < allowed {
                let Some(input) = player.waiting.pop_front() else { break };
                if let Standing::Dead { .. } = player.standing {
                    let back = section.as_ref().filter(|_| input.respawn && player.standing.may_respawn());
                    if let Some([x, y]) = back.and_then(|section| respawn_point(section, player.body.x, player.body.y))
                    {
                        player.body = standing_on(floor, blocks, x, y);
                        player.standing = Standing::Inside;
                    }
                } else {
                    player.body = step_body(&player.body, &input.controls, blocks, floor, TICK_SECONDS);
                }
                player.shown = input.shown;
                player.stepped += 1;
                player.acknowledged = input.sequence;
            }
            if let Some(section) = section {
                player.standing = player.standing.tick(section, player.body.x, player.body.y);
            }
        }
    }

    /// Every player as the room last stepped them, in the order of their numbers.
    pub fn seen(&self) -> impl Iterator<Item = Seen> + '_ {
        self.players.iter().map(|(&player, found)| Seen {
            player,
            body: found.body,
            standing: found.standing,
            shown: found.shown.clone(),
            acknowledged: found.acknowledged,
        })
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

#[cfg(test)]
#[path = "room_tests.rs"]
mod room_tests;

#[cfg(test)]
#[path = "node_tests.rs"]
mod node_tests;
