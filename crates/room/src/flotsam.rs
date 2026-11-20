//! What floats where a captain's ship went down: her rank's pieces for each player who fought her, kept for that
//! player alone as a land drop is, within `SPREAD_M` of where she sank, drifting downwind until they are gathered or
//! lie their time. Each piece is a drop of the gear loop's own law for a foe of her rank and level (`gear::rewards`,
//! `gear::ammo`); for an Elite or higher one piece is a chest, rolled as a foe one rank higher. A player's ship within
//! `GATHER_M` of one of their pieces gathers it, taking what it holds that they have room for.

use crate::PlayerId;
use crate::battle::Sank;
use gear::character::{Character, Vestige};
use gear::dice::{Dice, Purpose};
use gear::rewards::{Foe, worth};
use gear::ship::found::{Source, salvage};
use naval::fight::{Event, Piece};
use naval::random::Mulberry32;
use naval::ranks::Rank;
use std::f64::consts::TAU;

/// How far from where she sank her pieces float, metres; how fast they drift downwind, metres a second; how long they
/// lie, in the sea's ticks of 1/60 s (three minutes); and how near a player's ship comes to gather one, metres.
pub const SPREAD_M: f64 = 30.0;
pub const DRIFT_M_S: f64 = 0.3;
pub const FLOAT_TICKS: u64 = 10_800;
pub const GATHER_M: f64 = 25.0;

/// How many pieces a ship of her rank leaves each player who fought her.
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

/// The foe whose kill a piece of a ship of her rank drops as: the rewards' foes, plainest to strongest, by her rank.
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

/// A piece floating for one player: its number, what it looks like, where it floats, the rank and level it is rolled
/// for, the tick it is gone, and the wind of the fight it came from, which it drifts down.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Floating {
    pub player: PlayerId,
    pub id: u32,
    pub kind: Piece,
    pub at: [f64; 2],
    pub rank: Rank,
    pub level: u8,
    pub until: u64,
    pub wind: [f64; 2],
}

/// What a piece held once gathered: a Vestige, an Ammo box and an Ammo crate, each if it held one and there was room,
/// and the ship's salvage taken (`gear::ship::found`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
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

    /// Lays what floats where a ship sank, `times` over (twice from her hold), each chest rolled `chest_up` ranks
    /// higher besides; answers each piece laid.
    pub fn lay(&mut self, sank: &Sank, clock: u64, (times, chest_up): (usize, u8)) -> Vec<Event> {
        let rank = sank.pirate.commission.rank;
        let level = sank.pirate.level.max(1);
        let mut laid = Vec::new();
        for &player in &sank.players {
            let mut draws = Mulberry32::new(sank.pirate.seed ^ player.wrapping_mul(0x9E37_79B9));
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
                let mut rolled = rank;
                for _ in 0..if chest { 1 + chest_up } else { 0 } {
                    rolled = one_up(rolled);
                }
                let id = self.next_id;
                self.next_id = self.next_id.wrapping_add(1).max(1);
                let until = clock + FLOAT_TICKS;
                self.pieces.push(Floating { player, id, kind, at, rank: rolled, level, until, wind: sank.wind });
                laid.push(Event::Flotsam { id, at, kind });
            }
        }
        laid
    }

    /// One tick at `clock`: every piece drifts down its wind (east and south) and those that have lain their time
    /// are gone; then each player's ship at `ships` gathers each of their pieces within `GATHER_M`, its contents
    /// going to their character where they have one. Answers each piece gathered, and what it held.
    pub fn tick(
        &mut self,
        clock: u64,
        ships: &[(PlayerId, [f64; 2])],
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
            let near = ships.iter().any(|(player, at)| {
                *player == piece.player && libm::hypot(at[0] - piece.at[0], at[1] - piece.at[1]) <= GATHER_M
            });
            // Only a player whose character the room holds can take what it holds: for anyone else it floats on.
            let Some(character) = characters.get_mut(&piece.player).filter(|_| near) else { return true };
            let held = open(piece, seed, self.difficulty, character);
            gathered.push((Event::Gathered { id: piece.id, by: piece.player }, piece.player, held));
            false
        });
        gathered
    }

    /// Each piece floating for a player.
    pub fn for_player(&self, player: PlayerId) -> impl Iterator<Item = &Floating> {
        self.pieces.iter().filter(move |piece| piece.player == player)
    }
}

/// A piece opened into a character: the drop of a foe of its rank and level, each part taken where there is room.
/// The chance a piece of a ship of `rank` holds a Vestige at `difficulty`: her foe's on land, raised as a harder
/// voyage raises a kill's.
#[must_use]
pub fn vestige_chance(rank: Rank, difficulty: gear::Difficulty) -> f64 {
    (worth(foe_of(rank)).vestige * difficulty.reward()).min(1.0)
}

fn open(piece: &Floating, seed: u64, difficulty: gear::Difficulty, character: &mut Character) -> Held {
    let dice = Dice { seed, tick: u64::from(piece.id), player: piece.player };
    let foe = worth(foe_of(piece.rank));
    let rank = piece.rank.number();
    let vestige = gear::vestige::dropped(vestige_chance(piece.rank, difficulty), foe.boss, piece.level, &dice)
        .map(|(rarity, slot, level)| Vestige { id: 0, rarity, slot, level })
        .filter(|vestige| character.pick_up(*vestige));
    let ammo_box = dice.roll(Purpose::AmmoBox, 0) < gear::ammo::box_chance(rank) && character.take_ammo_box();
    let ammo_crate = gear::ammo::drops_crate(rank) && character.take_crate();
    let source = Source::Flotsam { rank, chest: piece.kind == Piece::Chest };
    let salvage = character.take_salvage(salvage(source, piece.level, &dice));
    Held { vestige, ammo_box, ammo_crate, salvage }
}

#[cfg(test)]
#[path = "flotsam_tests.rs"]
mod tests;
