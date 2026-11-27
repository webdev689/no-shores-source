//! What floats where a captain's ship went down: its rank's pieces for each player who fought it, kept for that
//! player alone as a land drop is, within `SPREAD_M` of where it sank, drifting downwind until they are gathered or
//! lie their time. Each piece holds the ship's salvage; the first also holds what one kill of a foe of the ship's rank
//! and level drops (`gear::rewards`, `gear::ammo`), so a ship drops as one foe does, and its hold as one a rank higher.
//! For an Elite or higher one piece is a chest, its salvage rolled one rank higher. A player's ship within `GATHER_M`
//! of one of their pieces gathers it, taking what it holds that they have room for.

use crate::PlayerId;
use crate::battle::Sank;
use crate::sea::islands::off_leg;
use gear::character::{Character, Vestige};
use gear::dice::{Dice, Purpose};
use gear::rewards::Foe;
use gear::ship::found::{Source, salvage};
use naval::fight::{Event, Piece};
use naval::random::Mulberry32;
use naval::ranks::Rank;
use std::f64::consts::TAU;

/// How far from where it sank its pieces float, metres; how fast they drift downwind, metres a second; how long they
/// lie, in the sea's ticks of 1/60 s (three minutes); and how near a player's ship comes to gather one, metres.
pub const SPREAD_M: f64 = 30.0;
pub const DRIFT_M_S: f64 = 0.3;
pub const FLOAT_TICKS: u64 = 10_800;
pub const GATHER_M: f64 = 25.0;

/// How many pieces a ship of its rank leaves each player who fought it.
#[must_use]
pub fn pieces_of(rank: Rank) -> usize {
    match rank {
        Rank::Minor => 3,
        Rank::Major => 4,
        Rank::Elite => 5,
        Rank::Miniboss => 6,
        Rank::Boss => 8,
    }
}

/// The foe whose kill a piece of a ship of its rank drops as: the rewards' foes, plainest to strongest, by its rank.
pub(crate) fn foe_of(rank: Rank) -> Foe {
    match rank {
        Rank::Minor => Foe::Skirmisher,
        Rank::Major => Foe::Swordsman,
        Rank::Elite => Foe::Brute,
        Rank::Miniboss | Rank::Boss => Foe::Captain,
    }
}

/// The rank one above, a Boss's own.
fn one_up(rank: Rank) -> Rank {
    Rank::numbered(rank.number() + 1).unwrap_or(Rank::Boss)
}

/// A piece floating for one player: its number, what it looks like, where it floats, the rank its salvage is rolled
/// for, the rank of the kill's drop it holds (the first piece laid alone), its level, the tick it is gone, and the
/// wind of the fight it came from, which it drifts down.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Floating {
    pub player: PlayerId,
    pub id: u32,
    pub kind: Piece,
    pub at: [f64; 2],
    pub rank: Rank,
    pub drop: Option<Rank>,
    pub level: u8,
    pub until: u64,
    pub wind: [f64; 2],
}

/// What a piece held once gathered: a Vestige, an Ammo box and an Ammo crate, each if it held one and there was room
/// (a Vestige without room goes to the mail), and the ship's salvage taken (`gear::ship::found`).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Held {
    pub vestige: Option<Vestige>,
    pub ammo_box: bool,
    pub ammo_crate: bool,
    pub salvage: gear::ship::found::Taken,
}

/// Every piece floating at sea, the next one's number, and the seed their contents are rolled from.
#[derive(Debug, Default)]
pub struct Flotsam {
    pub pieces: Vec<Floating>,
    next_id: u32,
    seed: u64,
    /// The sea's tier, which raises the chance of a Vestige in a piece as it raises a kill's on land.
    pub difficulty: gear::Difficulty,
}

impl Flotsam {
    /// No pieces yet, their contents rolled from `seed`.
    #[must_use]
    pub fn new(seed: u32) -> Self {
        Flotsam { pieces: Vec::new(), next_id: 1, seed: u64::from(seed), difficulty: gear::Difficulty::Normal }
    }

    /// Rolls the contents from the host's own loot seed, which the sea's seed, shown in its islands', never shows.
    pub fn reseed(&mut self, loot: u64) {
        self.seed = loot;
    }

    /// Lays what floats where a ship sank, `times` over (twice from its hold), each chest's salvage rolled `chest_up`
    /// ranks higher besides, and the first piece holding a kill's drop `chest_up` ranks higher than the ship's (a
    /// hold's one higher); answers each piece laid.
    pub fn lay(&mut self, sank: &Sank, clock: u64, (times, chest_up): (usize, u8)) -> Vec<Event> {
        let rank = sank.hostile.commission.rank;
        let level = sank.hostile.level.max(1);
        let mut laid = Vec::new();
        for &player in &sank.players {
            let mut draws = Mulberry32::new(sank.hostile.seed ^ player.wrapping_mul(0x9E37_79B9));
            for nth in 0..pieces_of(rank) * times {
                let (bearing, out) = (draws.draw() * TAU, SPREAD_M * draws.draw().sqrt());
                let at = [sank.at[0] + libm::sin(bearing) * out, sank.at[1] - libm::cos(bearing) * out];
                let chest = rank.number() >= Rank::Elite.number() && nth % pieces_of(rank) == 0;
                let kind = if chest {
                    Piece::Chest
                } else if draws.draw() < 0.5 {
                    Piece::Crate
                } else {
                    Piece::Barrel
                };
                let raised = |times: u8| (0..times).fold(rank, |rolled, _| one_up(rolled));
                let rolled = if chest { raised(1 + chest_up) } else { rank };
                let drop = (nth == 0).then(|| raised(chest_up));
                let id = self.next_id;
                self.next_id = self.next_id.wrapping_add(1).max(1);
                let until = clock + FLOAT_TICKS;
                self.pieces.push(Floating { player, id, kind, at, rank: rolled, drop, level, until, wind: sank.wind });
                laid.push(Event::Flotsam { id, at, kind });
            }
        }
        laid
    }

    /// One tick at `clock`: every piece drifts down its wind (east and south) and those that have lain their time
    /// are gone; then each player's ship gathers each of their pieces within `GATHER_M` of the leg it sailed this
    /// tick (`ships`, from where it lay to where it lies), its contents going to their character where they have one.
    /// Answers each piece gathered, and what it held.
    pub fn tick(
        &mut self,
        clock: u64,
        ships: &[(PlayerId, [[f64; 2]; 2])],
        characters: &mut std::collections::BTreeMap<PlayerId, Character>,
    ) -> Vec<(Event, PlayerId, Held)> {
        self.pieces.retain(|piece| clock < piece.until);
        let mut gathered = Vec::new();
        let seed = self.seed;
        self.pieces.retain_mut(|piece| {
            let speed = libm::hypot(piece.wind[0], piece.wind[1]);
            if speed > 0.0 {
                let drift = piece.wind.map(|along| along / speed * DRIFT_M_S * movement::TICK_SECONDS);
                piece.at = [piece.at[0] + drift[0], piece.at[1] + drift[1]];
            }
            // Along the whole leg: at a pace of 200 a ship sails farther than GATHER_M in a tick.
            let near = (ships.iter())
                .any(|(player, [from, to])| *player == piece.player && off_leg(piece.at, *from, *to) <= GATHER_M);
            // Only a player whose character the room holds can take what it holds: for anyone else it floats on.
            let Some(character) = characters.get_mut(&piece.player).filter(|_| near) else { return true };
            let held = open(piece, seed, self.difficulty, character);
            gathered.push((Event::Gathered { id: piece.id, by: piece.player }, piece.player, held));
            false
        });
        gathered
    }
}

/// A piece opened into a character: its salvage, and for the piece holding the kill's drop, what a foe of that rank
/// and its level drops, each part taken where there is room.
fn open(piece: &Floating, seed: u64, difficulty: gear::Difficulty, character: &mut Character) -> Held {
    // Rolled by the piece's own number, unique among all the sea lays, never by its owner's: a rejoin's new number
    // owns it again (`Sea::own`), and must not roll it again.
    let dice = Dice { seed, tick: u64::from(piece.id), player: 0 };
    let mut held = Held { salvage: ship_salvage(piece, difficulty, &dice, character), ..Held::default() };
    let Some(drop) = piece.drop else { return held };
    let rank = drop.number();
    // The best Vestige carried is the one told, the rest posted when the ten are full; the items a Miniboss or a Boss
    // leaves are kept as they are made.
    let mut taken: Vec<Vestige> = character.loot_kill(rank, piece.level, difficulty, gear::Source::World, &dice);
    taken.retain(|vestige| character.carry_or_post(vestige.clone(), gear::mail::Source::Flotsam));
    held.vestige = taken.into_iter().max_by_key(|vestige| vestige.rarity);
    held.ammo_box = dice.roll(Purpose::AmmoBox, 0) < gear::ammo::box_chance(rank) && character.take_ammo_box();
    held.ammo_crate = gear::ammo::drops_crate(rank) && character.take_crate();
    held
}

/// A piece's ship salvage, its own roll: ship materials and now and then a module, as the ship's rules hold them for
/// a piece of a ship of its rank (`gear::ship::found`), taken where there is room.
fn ship_salvage(
    piece: &Floating,
    difficulty: gear::Difficulty,
    dice: &Dice,
    character: &mut Character,
) -> gear::ship::found::Taken {
    let source = Source::Flotsam { rank: piece.rank.number(), chest: piece.kind == Piece::Chest };
    character.take_salvage(salvage(source, piece.level, difficulty.reward(), dice))
}

#[cfg(test)]
#[path = "flotsam_tests.rs"]
mod tests;
