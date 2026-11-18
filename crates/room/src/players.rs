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

/// How often, in ticks, a player's changed gear is sent: five times a second.
pub const GEAR_EVERY_TICKS: u64 = 12;

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
/// (`combat::Arms` as its code); the room tick of the last snapshot their screen showed; a foe to stand before them,
/// or every foe sent away, if they asked (the Test Ground's panel), and the foe's level (0 for none: it fights by
/// combat's own numbers); whether they ask to respawn, dead past a node's section; and an ask of their gear.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Input {
    pub sequence: u32,
    pub intent: combat::Intent,
    pub shown: Shown,
    pub dress: Option<String>,
    pub arms: u32,
    pub seen: u64,
    pub spawn: Option<SpawnAsk>,
    pub respawn: bool,
    pub ask: Option<Asked>,
    pub spawn_level: u8,
}

/// What a player asks of the room's foes: one of a type (the roster's number) at a rank (its number; a rank the type
/// does not come in, or none, takes the type's first), with a shield of an element (the gear crate's number, 0 for
/// none), or every foe sent away.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpawnAsk {
    Foe { foe_type: u8, rank: u8, shield: u8 },
    Clear,
}

impl SpawnAsk {
    /// A foe asked for by its role alone (1 skirmisher to 5 captain, no type), as a page from before the roster asks:
    /// the pirates' type in that role, a Major, or at its first rank if it comes in none (their Captain an Elite).
    #[must_use]
    pub fn by_role(role: u8, shield: u8) -> Option<Self> {
        let foe_type = ::foes::in_role(::foes::factions::PIRATES, ::foes::Role::from_number(role)?)?;
        let rank = foe_type.rank_or_first(Some(::foes::Rank::Major)) as u8;
        Some(Self::Foe { foe_type: foe_type.number, rank, shield })
    }
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
    /// Where they stood as their gear was last sent: at the Reader, and in a social space. Both ride the gear
    /// message and change as they walk, so a change sends it again.
    pub placed_sent: (bool, bool),
    /// The tick their gear was last sent, and their last ask taken: a room sends one player's gear, and takes their
    /// asks, only so often.
    pub gear_sent: Option<u64>,
    pub asked_at: Option<u64>,
    /// Asks waiting their turn, oldest first; and whether their gear changes how they fight, so goes at once.
    pub asks: VecDeque<crate::asks::Asked>,
    pub gear_urgent: bool,
    /// The answer to their last ask (0 done, else why not), the item a Vestige last opened to, and how many asks
    /// have been answered.
    pub answer: u8,
    pub identified: u32,
    pub answered: u32,
    /// The room's resource nodes they have gathered from this turn, spent for them.
    pub spent: Vec<u8>,
    /// The account that keeps their character, if one does: what they gathered this turn follows it across a rejoin.
    pub owner: Option<String>,
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
            placed_sent: (false, false),
            gear_sent: None,
            asked_at: None,
            asks: VecDeque::new(),
            gear_urgent: false,
            answer: 0,
            identified: 0,
            answered: 0,
            spent: Vec::new(),
            owner: None,
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

    /// Whether a player's gear changed since it was last sent and is due to be sent to them alone: at most every
    /// `GEAR_EVERY_TICKS`, so a page that asks without end cannot flood its socket or slow the room; at once when it
    /// changes how they fight.
    pub fn take_gear_change(&mut self, player: PlayerId) -> bool {
        let clock = self.clock;
        let placed = (self.at_reader(player), self.in_social_space(player));
        let Some(found) = self.players.get_mut(&player) else { return false };
        found.gear_changed |= placed != found.placed_sent;
        let waiting = found.gear_sent.is_some_and(|sent| clock < sent + GEAR_EVERY_TICKS);
        if !found.gear_changed || waiting && !found.gear_urgent {
            return false;
        }
        found.placed_sent = placed;
        found.gear_changed = false;
        found.gear_urgent = false;
        found.gear_sent = Some(clock);
        true
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

    /// Sets the day, counted from the epoch, whose wares the room's vendors show; when it turns, every player is sent
    /// the new day's wares, so none buys what they were not shown.
    pub fn set_day(&mut self, day: u64) {
        if self.day == day {
            return;
        }
        self.day = day;
        for found in self.players.values_mut() {
            found.gear_changed = true;
        }
    }

    /// Notes the account that keeps a player's character: in a patrol, the nodes that account gathered this turn are
    /// spent for them again, however often they rejoin.
    pub fn own(&mut self, player: PlayerId, owner: &str) -> bool {
        let gathered = self.patrol.as_ref().and_then(|patrol| patrol.gathered.get(owner)).cloned().unwrap_or_default();
        let Some(found) = self.players.get_mut(&player) else { return false };
        found.owner = Some(owner.to_owned());
        for node in gathered {
            if !found.spent.contains(&node) {
                found.spent.push(node);
            }
        }
        found.gear_changed = true;
        true
    }

    /// A player as the room keeps them.
    #[must_use]
    pub fn player(&self, player: PlayerId) -> Option<&Player> {
        self.players.get(&player)
    }
}
