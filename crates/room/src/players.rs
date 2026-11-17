//! A room's players: what each sends (a tick's intent, the look of its own figure, its dress, what it holds, the tick
//! of the room it was seeing, and a foe to stand before it), the checks an input must pass, and what the room keeps of
//! each to judge blows on it as it saw them.

use crate::Room;
use crate::asks::Asked;
use combat::Fighter;
use combat::fighter::FighterId;
use gear::Character;
use reach::Standing;
use std::collections::VecDeque;

/// A player's number in a room, never reused while the room lives: one count with the foes'.
pub type PlayerId = FighterId;

/// How many ticks of inputs a player may run ahead of the room's clock, to ride out a network's jitter.
pub const SLACK_TICKS: u64 = 6;
/// How many inputs a player may have waiting; past that, the oldest is let go (as taken), so a flood or a burst after a
/// stall never refuses one and never breaks the order.
pub const WAITING_LIMIT: usize = 30;
/// How many of a player's inputs one tick may take: one is due, the rest catch up after a stall, no faster than this.
pub const CATCH_UP: usize = 3;
/// How far the room tick a player says it was seeing may move on from one input to the next.
pub const SEEN_STEP: u64 = 4;
/// How long after a player stands again the foes leave them be, unless they strike first.
pub const GRACE: u64 = 180;
/// How often a player's dress may change; a change sooner waits its turn.
pub const DRESS_EVERY: u64 = 60;
/// How many players a room holds.
pub const PLAYERS_MOST: usize = 16;
/// The longest move name and dress, in bytes, a player may send.
pub const MOVE_LIMIT: usize = 40;
pub const DRESS_LIMIT: usize = 4096;
/// How far behind the room's clock a player's view may be taken: its blows judged as it saw them, blows on it waiting
/// this long at most for its view to reach them.
pub const VIEW_LAG: u64 = 24;
/// How many of a player's past fighters, by input, the room keeps to judge blows on it as it saw them.
pub const HISTORY: usize = 64;

/// Why an input was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Refused {
    NoSuchPlayer,
    /// Inputs are numbered 1, 2, 3… for each player, and must arrive in that order.
    OutOfOrder {
        expected: u32,
        got: u32,
    },
    /// A move name that is not lowercase letters, digits and underscores, or a move or dress past its limit.
    BadLook,
}

/// What a player's figure shows, as their own browser draws it: the forge's move, its frame, and the way it faces.
/// The room decides nothing about it; it passes it on with the fighter it goes with.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Shown {
    pub anim: String,
    pub frame: u16,
    pub facing: f64,
}

/// One input from a player: its number; one tick's intent (movement and the fight's buttons); what their figure
/// shows; their dress when it changed (as the browser writes it; the room only carries it); what their hands hold
/// (`combat::Arms` as its code); the room tick of the last snapshot their screen showed; and a foe's kind to stand
/// before them, if they asked for one (the Test Ground's panel), and its level (0 for none: it fights by combat's own
/// numbers); whether they ask to respawn, dead past a node's section; and an ask of their gear.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Input {
    pub sequence: u32,
    pub intent: combat::Intent,
    pub shown: Shown,
    pub dress: Option<String>,
    pub arms: u32,
    pub seen: u64,
    pub spawn: Option<u8>,
    pub respawn: bool,
    pub ask: Option<Asked>,
    pub spawn_level: u8,
}

impl Input {
    /// Whether its look and dress are within what a room carries, and every number in it is one (the intent's reading
    /// already took a pitch or mark that is none as such).
    #[must_use]
    pub fn fits(&self) -> bool {
        let anim = &self.shown.anim;
        let named = anim.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_');
        let dress_fits = self.dress.as_ref().is_none_or(|dress| dress.len() <= DRESS_LIMIT);
        let controls = self.intent.controls;
        let numbers = [controls.forward, controls.sideways, controls.yaw, self.shown.facing];
        named && anim.len() <= MOVE_LIMIT && dress_fits && numbers.iter().all(|number| number.is_finite())
    }
}

/// A player as the room keeps them.
#[derive(Debug)]
pub struct Player {
    pub fighter: Fighter,
    /// Where the player stands with the room's section: always inside a room with none.
    pub standing: Standing,
    pub shown: Shown,
    pub dress: String,
    pub dress_changed: bool,
    /// The room's clock when the player joined, and how many of their inputs have stepped their fighter since.
    pub joined: u64,
    pub stepped: u64,
    /// The number of the last input received, and of the last that stepped the fighter.
    pub received: u32,
    pub acknowledged: u32,
    pub waiting: VecDeque<Input>,
    /// The tick of the room the player's last taken input was seeing, and its fighter after each recent input with
    /// the tick that input was seeing.
    pub seen: u64,
    pub history: VecDeque<(u64, Fighter)>,
    /// The room tick until which the foes leave the player be, having just stood again.
    pub graced: u64,
    /// A dress waiting its turn, and the room tick the dress last changed (none before the first).
    pub dress_next: Option<String>,
    pub dressed_at: Option<u64>,
    /// Their gear, and whether it changed since it was last sent to them.
    pub character: Character,
    pub gear_changed: bool,
    /// The answer to their last ask (0 done, else why not), the item a Vestige last opened to, and how many asks
    /// have been answered.
    pub answer: u8,
    pub identified: u32,
    pub answered: u32,
    /// The room's resource nodes they have gathered from, spent for them until they leave.
    pub spent: Vec<u8>,
    /// What their worn gear trims of the fight's numbers, set whenever it may change.
    pub trim: combat::Trim,
}

impl Player {
    #[must_use]
    pub fn new(fighter: Fighter, joined: u64) -> Self {
        Player {
            fighter,
            standing: Standing::Inside,
            shown: Shown::default(),
            dress: String::new(),
            dress_changed: false,
            joined,
            stepped: 0,
            received: 0,
            acknowledged: 0,
            waiting: VecDeque::new(),
            seen: joined,
            history: VecDeque::new(),
            graced: 0,
            dress_next: None,
            dressed_at: None,
            character: Character::starting(),
            gear_changed: true,
            answer: 0,
            identified: 0,
            answered: 0,
            spent: Vec::new(),
            trim: combat::Trim::PLAIN,
        }
    }

    /// Keeps the fighter after an input that was seeing `seen`.
    pub fn remember(&mut self, seen: u64) {
        self.seen = seen;
        self.history.push_back((seen, self.fighter));
        while self.history.len() > HISTORY {
            self.history.pop_front();
        }
    }

    /// The fighter as the player stood when their screen first showed the room's tick `tick`, if their inputs have
    /// reached it.
    #[must_use]
    pub fn as_it_saw(&self, tick: u64) -> Option<&Fighter> {
        self.history.iter().find(|(seen, _)| *seen >= tick).map(|(_, fighter)| fighter)
    }
}

impl Room {
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

    /// Whether a player's gear changed since this was last asked, so it should be sent to them alone.
    pub fn take_gear_change(&mut self, player: PlayerId) -> bool {
        self.players.get_mut(&player).is_some_and(|found| std::mem::take(&mut found.gear_changed))
    }

    /// A player's character as it is kept between sessions.
    #[must_use]
    pub fn kept_character(&self, player: PlayerId) -> Option<String> {
        self.players.get(&player).map(|found| found.character.to_json())
    }

    /// Gives a player the character kept for them, trimming their fight by it and sending them their gear; false if
    /// they are not in the room or the text is not a character.
    pub fn restore_character(&mut self, player: PlayerId, text: &str) -> bool {
        let Some(character) = gear::Character::from_json(text) else { return false };
        let Some(found) = self.players.get_mut(&player) else { return false };
        found.character = character;
        found.gear_changed = true;
        self.retrim(player);
        true
    }

    /// Whether a player stands where a social space's asks are answered.
    #[must_use]
    pub fn social_for(&self, player: PlayerId) -> bool {
        self.here(player).social
    }

    /// A player as the room keeps them.
    #[must_use]
    pub fn player(&self, player: PlayerId) -> Option<&Player> {
        self.players.get(&player)
    }
}
