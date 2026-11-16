//! A shared space on the server: the players in it, each player's inputs taken in order, and their bodies stepped by
//! the movement rules, one input a tick and never faster than the room's own clock. It has no network and no clock:
//! whatever hosts the room hands it inputs and ticks, and sends out what it sees. See the Server note in the bible.

use movement::{Block, Body, Controls, TICK_SECONDS, standing, step_body};
use std::collections::{BTreeMap, VecDeque};

/// A player's number in a room, never reused while the room lives.
pub type PlayerId = u32;

/// How many ticks of inputs a player may run ahead of the room's clock, to ride out a network's jitter.
pub const SLACK_TICKS: u64 = 6;
/// How many inputs a player may have waiting; past that, more are refused.
pub const WAITING_LIMIT: usize = 30;
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

/// One input from a player: its number, one tick's controls, what their figure shows, and their dress when it changed
/// (as the browser writes it; the room only carries it).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Input {
    pub sequence: u32,
    pub controls: Controls,
    pub shown: Shown,
    pub dress: Option<String>,
}

#[derive(Debug)]
struct Player {
    body: Body,
    shown: Shown,
    dress: String,
    dress_changed: bool,
    /// The room's clock when the player joined, and how many of their inputs have stepped their body since.
    joined: u64,
    stepped: u64,
    /// The number of the last input received, and of the last that stepped the body.
    received: u32,
    acknowledged: u32,
    waiting: VecDeque<(Controls, Shown)>,
}

/// A player as the room last stepped them: their body, what their figure showed with it, and the number of their last
/// input it took.
#[derive(Clone, Debug, PartialEq)]
pub struct Seen {
    pub player: PlayerId,
    pub body: Body,
    pub shown: Shown,
    pub acknowledged: u32,
}

/// One shared space: its course, its clock in ticks, and its players in the order of their numbers.
#[derive(Debug)]
pub struct Room {
    blocks: Vec<Block>,
    spawn: (f64, f64),
    clock: u64,
    next_player: PlayerId,
    players: BTreeMap<PlayerId, Player>,
}

impl Room {
    /// An empty room on a course of blocks, where players stand at `spawn` (x, y) when they join.
    #[must_use]
    pub fn new(blocks: Vec<Block>, spawn: (f64, f64)) -> Self {
        Room { blocks, spawn, clock: 0, next_player: 1, players: BTreeMap::new() }
    }

    /// A new player, standing at the spawn.
    pub fn join(&mut self) -> PlayerId {
        let player = self.next_player;
        self.next_player += 1;
        let body = standing(self.spawn.0, self.spawn.1);
        let joined = self.clock;
        let waiting = VecDeque::new();
        let (shown, dress) = (Shown::default(), String::new());
        let entry = Player {
            body,
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

    /// The player's input, which must follow their last. Its controls and look wait for the room's next tick; a new
    /// dress is taken at once.
    pub fn input(&mut self, player: PlayerId, input: Input) -> Result<(), Refused> {
        let found = self.players.get_mut(&player).ok_or(Refused::NoSuchPlayer)?;
        let expected = found.received.wrapping_add(1);
        if input.sequence != expected {
            return Err(Refused::OutOfOrder { expected, got: input.sequence });
        }
        if found.waiting.len() >= WAITING_LIMIT {
            return Err(Refused::TooManyWaiting);
        }
        let named =
            input.shown.anim.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_');
        let dress_fits = input.dress.as_ref().is_none_or(|dress| dress.len() <= DRESS_LIMIT);
        if !named || input.shown.anim.len() > MOVE_LIMIT || !dress_fits {
            return Err(Refused::BadLook);
        }
        found.received = input.sequence;
        found.waiting.push_back((input.controls, input.shown));
        if let Some(dress) = input.dress
            && dress != found.dress
        {
            found.dress = dress;
            found.dress_changed = true;
        }
        Ok(())
    }

    /// One tick of the room's clock. Each player's waiting inputs step their body in order, one step each, as many as
    /// the clock allows: no more than the ticks since they joined, and the slack.
    pub fn tick(&mut self) {
        self.clock += 1;
        for player in self.players.values_mut() {
            let allowed = self.clock - player.joined + SLACK_TICKS;
            while player.stepped < allowed {
                let Some((controls, shown)) = player.waiting.pop_front() else { break };
                player.body = step_body(&player.body, &controls, &self.blocks, TICK_SECONDS);
                player.shown = shown;
                player.stepped += 1;
                player.acknowledged = player.acknowledged.wrapping_add(1);
            }
        }
    }

    /// Every player as the room last stepped them, in the order of their numbers.
    pub fn seen(&self) -> impl Iterator<Item = Seen> + '_ {
        self.players.iter().map(|(&player, found)| Seen {
            player,
            body: found.body,
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
