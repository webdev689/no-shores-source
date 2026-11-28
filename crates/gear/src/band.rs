//! The band: an hour of each activity at a level, reckoned on average from the rules' own pay and the measured times
//! below, against a patrol zone's at the same level, the game's floor of play, so no activity is the one place worth
//! playing ("I dont want it to be the goto where other content doesnt matter"). XP and Aurem stand within 0.7 and
//! twice a patrol zone's; loot within three quarters and five times, for the owner's order asks harder content to drop
//! more and better. Loot weighs each colour twice the one below, as each drops half as often or less. What is counted
//! and the table are in `Activities` ("The band").

use crate::chests::{CHEST_AUREM, CHEST_FRAGMENTS, CHEST_RESOURCE, CHEST_XP, FIRST_HEROIC_ESSENCE};
use crate::lamps::{
    KILL_SHARE, LAMP_PAY, LAMP_VESTIGE, MISSION_PAY, MISSION_VESTIGE, RELIQUARY_FRAGMENTS, RELIQUARY_PAY,
    RELIQUARY_VESTIGE, SKIRMISH_PAY, SKIRMISH_VESTIGE, VAULT_ITEM, VAULT_PAY, VEIN_FRAGMENTS, VEIN_PAY, find_times,
    pay_times,
};
use crate::playlist::Playlist;
use crate::power::gap;
use crate::rewards::{Clear, Foe, NODE_YIELD, at_level, worth};
use crate::ship::SINKING_KILLS;
use crate::ship::found::{Source, holds};
use crate::vestige::{OPENS, chance, colours, gated, item_chance};
use crate::world::Difficulty;

/// The levels measured: every fifth from 5 to 30.
pub const LEVELS: [u8; 6] = [5, 10, 15, 20, 25, 30];
/// What a Vestige or an item weighs in loot by its colour, Normal to Atheric.
pub const COLOUR_WEIGHT: [f64; 5] = [1.0, 2.0, 4.0, 8.0, 16.0];
/// The least and the most of a patrol zone's hour every activity's XP and Aurem an hour may be, and its loot.
pub const PAY_BAND: (f64, f64) = (0.7, 2.0);
pub const LOOT_BAND: (f64, f64) = (0.75, 5.0);

/// The hours of play a week holds, two a day, over which the day's and the week's rewards are spread: Claude's call,
/// a player who plays most days, as Destiny 1's weekly caps were set for.
pub const PLAY_HOURS_A_WEEK: f64 = 14.0;
const DAYS_A_WEEK: f64 = 7.0;

/// The seconds a scripted player takes for each foe of a patrol zone's garrison, walking between its groups, and
/// the foes the garrison stands: `room::band_measure_tests::measure_the_pace`, 11.7 to 12.4 s and 9 to 15 over three
/// zones (three or four groups of two to four, `room::garrison`).
pub const PATROL_SECONDS_A_FOE: f64 = 12.0;
pub const PATROL_FOES: f64 = 12.0;
/// A cleared group stands again 120 s after it fell (`room::garrison::STAND_AGAIN`); the player gathers meanwhile.
pub const STAND_AGAIN_SECONDS: f64 = 120.0;
/// Resource places lie 180 m apart along a zone's paths (`layout::sites::RESOURCE_EVERY_M`), run at 7.59 m/s
/// (`movement::TUNING.run`), each held 2 s (`room::asks::GATHER_TICKS`).
pub const NODE_APART_M: f64 = 180.0;
pub const RUN_M_A_SECOND: f64 = 7.59;
pub const GATHER_SECONDS: f64 = 2.0;
/// A public event comes every 15 minutes in each zone that runs them (`room::public::PERIOD_MINUTES`), and takes 2.5
/// to 5.5 minutes as scripted (`Public Events as Claude Builds Them`): 3.5 on average.
pub const EVENTS_AN_HOUR: f64 = 4.0;
pub const EVENT_SECONDS: f64 = 210.0;
/// How often an event's chest is of each tier (won, with its bonus, heroic, heroic with its bonus): Claude's call,
/// evenly, for no code fixes how often a bonus or a heroic is met.
pub const CHEST_TIER_SHARES: [f64; 4] = [0.25, 0.25, 0.25, 0.25];

/// A patrol's dungeon: its foes but its Reeve, and the seconds a scripted player takes for each, its rooms walked
/// (`measure_the_pace`, nine dungeons: 7 to 22 foes, 17 on average; 21 to 38 s a foe, 28 over them all); with its
/// Reeve's 51 s (`measure_blows`), and the walk back out to the next of the patrol's three: Claude's minute.
pub const DUNGEON_FOES: f64 = 17.0;
pub const DUNGEON_SECONDS: f64 = 17.0 * 28.0 + 51.0;
pub const DUNGEON_WALK_SECONDS: f64 = 60.0;
/// An Elite Dungeon's run at its foes' level: its foes but its Boss, and the seconds a scripted player takes for each
/// (`measure_the_pace`, six dungeons, their seals broken: 18 to 23 foes, 22 on average; 23 to 34 s a foe, 27 over
/// them all), and its Boss's 106 s (`measure_blows`); a run found waits a minute at most (`Activities`, "Runs and
/// companies"). Every activity is measured for one player: a company shares every kill, so its hour grows alike.
pub const ELITE_FOES: f64 = 22.0;
pub const ELITE_SECONDS: f64 = 22.0 * 27.0 + 106.0;
pub const RUN_WAIT_SECONDS: f64 = 60.0;

/// The sea: a ship sighted every four to six minutes and a fight of three and a half to four and a half
/// (`ship::SINKING_KILLS`'s measure, `The Balance and Economy Pass as Claude Shapes It`).
pub const SIGHTING_SECONDS: f64 = 300.0;
pub const SEA_FIGHT_SECONDS: f64 = 240.0;
/// The ranks a sighting sends by the band's first level, Minor to Miniboss (`room::sighting::RANKS_BY_BAND`).
pub const SEA_RANKS: [(u8, [f64; 4]); 9] = [
    (1, [0.50, 0.40, 0.10, 0.0]),
    (4, [0.34, 0.44, 0.22, 0.0]),
    (7, [0.30, 0.47, 0.23, 0.0]),
    (10, [0.27, 0.49, 0.24, 0.0]),
    (13, [0.25, 0.45, 0.25, 0.05]),
    (16, [0.20, 0.45, 0.27, 0.08]),
    (19, [0.15, 0.45, 0.30, 0.10]),
    (22, [0.13, 0.43, 0.32, 0.12]),
    (26, [0.10, 0.40, 0.35, 0.15]),
];
/// The foe each rank at sea pays as, Minor to Miniboss (`room::flotsam::foe_of`).
pub const SEA_FOES: [Foe; 4] = [Foe::Skirmisher, Foe::Swordsman, Foe::Brute, Foe::Captain];
/// The pieces a sunk ship leaves each player, Minor to Miniboss (`room::flotsam::pieces_of`).
pub const SEA_PIECES: [f64; 4] = [3.0, 4.0, 5.0, 6.0];

/// A passage zone: its foes felled and the seconds a scripted player takes over its deal to done, on foot
/// (`room::deal_measure_tests::measure_the_deals`, six weeks' zones, three of each deal and lamp, the 43 of 45 it did:
/// 6.4 foes and 202 s a zone, each deal weighed as the web deals it, 38 s a foe against a patrol's 12), and the passage
/// between zones, 1.5 s up, 2 s across and 1.5 s down and in (`Passages as Claude Builds Them`).
pub const PASSAGE_FOES: f64 = 6.4;
pub const PASSAGE_SECONDS: f64 = 202.0;
pub const PASSAGE_BETWEEN_SECONDS: f64 = 5.0;
/// The passages' island, Saltmere's band, and its depths.
pub const PASSAGE_BAND: (u8, u8) = (1, 4);
pub const DEPTHS: u8 = 20;
/// The share of a haul lost to death between lamps: Claude's stated rate, one dive in twenty at the first depth, one
/// in four at the twentieth, rising evenly.
#[must_use]
pub fn haul_lost(depth: u8) -> f64 {
    0.05 + 0.20 * f64::from(depth.clamp(1, DEPTHS) - 1) / f64::from(DEPTHS - 1)
}

/// An hour's pay, on average.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Hour {
    pub xp: f64,
    pub aurem: f64,
    /// Vestiges and items found as themselves, by colour, Normal to Atheric.
    pub vestiges: [f64; 5],
    pub items: [f64; 5],
    /// Fragments, the island's resources and the ship's materials, counted together.
    pub materials: f64,
    /// Essence of both stocks together.
    pub essence: f64,
}

impl Hour {
    /// Loot weighed by colour.
    #[must_use]
    pub fn loot(&self) -> f64 {
        (0..5).map(|colour| (self.vestiges[colour] + self.items[colour]) * COLOUR_WEIGHT[colour]).sum()
    }

    #[must_use]
    pub fn plus(self, other: Hour) -> Hour {
        let add = |one: [f64; 5], two: [f64; 5]| std::array::from_fn(|colour| one[colour] + two[colour]);
        Hour {
            xp: self.xp + other.xp,
            aurem: self.aurem + other.aurem,
            vestiges: add(self.vestiges, other.vestiges),
            items: add(self.items, other.items),
            materials: self.materials + other.materials,
            essence: self.essence + other.essence,
        }
    }

    #[must_use]
    pub fn times(self, by: f64) -> Hour {
        Hour {
            xp: self.xp * by,
            aurem: self.aurem * by,
            vestiges: self.vestiges.map(|count| count * by),
            items: self.items.map(|count| count * by),
            materials: self.materials * by,
            essence: self.essence * by,
        }
    }

    /// What a death's share takes: the finds a haul holds (Vestiges, items, materials and Essence), never XP or Aurem.
    fn less_finds(self, lost: f64) -> Hour {
        let kept = self.times(1.0 - lost);
        Hour { xp: self.xp, aurem: self.aurem, ..kept }
    }
}

/// The share of each colour a drop of these weights takes at a foe's level, the colours too good for it struck out.
fn shares(weights: [u32; 5], level: u8) -> [f64; 5] {
    let allowed = gated(weights, level);
    let sum = f64::from(allowed.iter().sum::<u32>().max(1));
    allowed.map(|weight| f64::from(weight) / sum)
}

/// The best of two drops of these weights, as a chest's bonus rolls them.
fn better_of_two(weights: [u32; 5], level: u8) -> [f64; 5] {
    let one = shares(weights, level);
    let below = |colour: usize| one[..=colour].iter().sum::<f64>();
    std::array::from_fn(|colour| {
        let under = if colour == 0 { 0.0 } else { below(colour - 1) };
        below(colour) * below(colour) - under * under
    })
}

/// XP and Aurem worth so much at level 5, at `level` and its tier, as `Character::pay` pays them.
fn paid((xp, aurem): (u32, u32), level: u8, tier: Difficulty) -> Hour {
    let times = |amount: u32| f64::from(at_level(amount, level)) * tier.reward();
    Hour { xp: times(xp), aurem: times(aurem), ..Hour::default() }
}

/// `count` Vestiges in these colour shares.
fn vestiges(count: f64, colour: [f64; 5]) -> Hour {
    Hour { vestiges: colour.map(|share| share * count), ..Hour::default() }
}

/// `count` items as themselves, dropped in these colour shares and opened as a Vestige of each colour opens.
fn items(count: f64, dropped: [f64; 5], level: u8) -> Hour {
    let mut opened = [0.0; 5];
    for (colour, share) in dropped.iter().enumerate() {
        let opens = shares(OPENS[colour], level);
        for (to, part) in opens.iter().enumerate() {
            opened[to] += share * part * count;
        }
    }
    Hour { items: opened, ..Hour::default() }
}

/// A kill of a foe of its kind and rank at its level and tier: its pay, its Vestige and its item as themselves.
fn kill(foe: Foe, rank: u8, level: u8, tier: Difficulty) -> Hour {
    let found = worth(foe, rank);
    let colour = shares(colours(rank), level);
    paid((found.xp, found.aurem), level, tier).plus(vestiges(chance(rank) * tier.reward(), colour)).plus(items(
        item_chance(rank) * tier.reward(),
        colour,
        level,
    ))
}

/// A kill of one of these kinds at a rank, each as likely.
fn kill_of(kinds: &[Foe], rank: u8, level: u8, tier: Difficulty) -> Hour {
    let each = 1.0 / kinds.len() as f64;
    kinds.iter().fold(Hour::default(), |sum, &foe| sum.plus(kill(foe, rank, level, tier).times(each)))
}

/// A patrol's Minors and Majors, its Runner, Collector and Crossbowman, each rank as likely (`room::garrison`).
fn patrol_kill(level: u8, tier: Difficulty) -> Hour {
    let kinds = [Foe::Skirmisher, Foe::Swordsman, Foe::Archer];
    kill_of(&kinds, 1, level, tier).times(0.5).plus(kill_of(&kinds, 2, level, tier).times(0.5))
}

/// A dungeon's bands: Majors of four kinds and Elites of two, each of the six as likely (`room::garrison::DUNGEON`).
fn dungeon_kill(level: u8, tier: Difficulty) -> Hour {
    let majors = kill_of(&[Foe::Skirmisher, Foe::Swordsman, Foe::Archer, Foe::Brute], 2, level, tier);
    majors.times(4.0 / 6.0).plus(kill_of(&[Foe::Brute, Foe::Archer], 3, level, tier).times(2.0 / 6.0))
}

/// A dungeon's clear (`Character::reward_clear`): its pay, an item and a Vestige by the clear's own chance.
fn dungeon_clear(level: u8, tier: Difficulty) -> Hour {
    let colour = shares(colours(4), level);
    let vestige = crate::rewards::CLEAR_VESTIGE * tier.reward();
    paid(Clear::Dungeon.worth(), level, tier).plus(vestiges(vestige, colour)).plus(items(tier.reward(), colour, level))
}

/// The day's first clear as the dungeon of the day and the playlists pay it: a Boss Captain's kill and a sure Vestige
/// in a Boss's colours.
fn day_clear(level: u8, tier: Difficulty) -> Hour {
    let found = worth(Foe::Captain, 5);
    paid((found.xp, found.aurem), level, tier).plus(vestiges(1.0, shares(colours(5), level)))
}

/// Something paid once a day, as an hour's share of a week's play.
fn daily(hour: Hour) -> Hour {
    hour.times(DAYS_A_WEEK / PLAY_HOURS_A_WEEK)
}

/// Something paid once a week, as an hour's share.
fn weekly(hour: Hour) -> Hour {
    hour.times(1.0 / PLAY_HOURS_A_WEEK)
}

/// The share of a clear's time a level gap below its foes lengthens it by: a blow strikes `gap` of itself.
fn slowed(level: u8, foes_at: u8) -> f64 {
    1.0 / gap(level, foes_at).max(0.01)
}

/// An hour in a patrol zone at `level`, at Normal: its public events, then its garrison fought and its nodes gathered
/// while each group waits to stand again; and the day's first heroic chest's Essence.
#[must_use]
pub fn patrol(level: u8) -> Hour {
    let tier = Difficulty::Normal;
    let chest = (0..4).fold(Hour::default(), |sum, at| {
        let rank = if at >= 2 { 5 } else { 2 };
        let colour = if at % 2 == 1 { better_of_two(colours(rank), level) } else { shares(colours(rank), level) };
        let materials = f64::from(2 * CHEST_FRAGMENTS[at] + CHEST_RESOURCE[at]);
        let opened = paid((CHEST_XP[at], CHEST_AUREM[at]), level, tier).plus(vestiges(1.0, colour));
        sum.plus(Hour { materials, ..opened }.times(CHEST_TIER_SHARES[at]))
    });
    let fighting = 3_600.0 - EVENTS_AN_HOUR * EVENT_SECONDS;
    let cycle = PATROL_FOES * PATROL_SECONDS_A_FOE + STAND_AGAIN_SECONDS;
    let gathers = STAND_AGAIN_SECONDS / (NODE_APART_M / RUN_M_A_SECOND + GATHER_SECONDS);
    let round = patrol_kill(level, tier).times(PATROL_FOES);
    let round = Hour { materials: gathers * f64::from(NODE_YIELD), ..round };
    let heroic = CHEST_TIER_SHARES[2] + CHEST_TIER_SHARES[3] > 0.0;
    let essence = if heroic { 2.0 * f64::from(FIRST_HEROIC_ESSENCE) } else { 0.0 };
    chest.times(EVENTS_AN_HOUR).plus(round.times(fighting / cycle)).plus(daily(Hour { essence, ..Hour::default() }))
}

/// An hour in a patrol's dungeons at `level`, at Normal: each cleared in turn, and the dungeon of the day's first
/// clear.
#[must_use]
pub fn patrol_dungeon(level: u8) -> Hour {
    let tier = Difficulty::Normal;
    let reeve = kill(Foe::Captain, 4, level, tier);
    let clear = dungeon_kill(level, tier).times(DUNGEON_FOES).plus(reeve).plus(dungeon_clear(level, tier));
    clear.times(3_600.0 / (DUNGEON_SECONDS + DUNGEON_WALK_SECONDS)).plus(daily(day_clear(level, tier)))
}

/// What one run of an Elite Dungeon pays at its foes' level and tier: its bands, its Boss and its cache.
fn elite_run(foes_at: u8, tier: Difficulty) -> Hour {
    let boss = kill(Foe::Captain, 5, foes_at, tier);
    dungeon_kill(foes_at, tier).times(ELITE_FOES).plus(boss).plus(dungeon_clear(foes_at, tier))
}

/// Runs an hour at `level` against foes at `foes_at`.
fn runs_an_hour(level: u8, foes_at: u8) -> f64 {
    3_600.0 / (ELITE_SECONDS * slowed(level, foes_at) + RUN_WAIT_SECONDS)
}

/// An hour of a playlist at `level`, from its band's first level; none below the level it opens at. Its daily and its
/// weekly (its third clear's Essence and Vestiges) beside its runs.
#[must_use]
pub fn playlist(which: Playlist, level: u8) -> Option<Hour> {
    let band = which.band_of(level)?;
    let (foes_at, tier) = (which.foes_at(band), which.tier());
    let runs = elite_run(foes_at, tier).times(runs_an_hour(level, foes_at));
    let week = vestiges(f64::from(which.week_vestiges()), shares(colours(5), foes_at));
    let week = Hour { essence: 2.0 * f64::from(which.week_essence()), ..week };
    Some(runs.plus(daily(day_clear(foes_at, tier))).plus(weekly(week)))
}

/// An hour of the week's Elite or Abyss Dungeon at `level`: its runs again, at their share once its first clear is
/// taken (`Weekly::run_again_share`), and its first clear's Vestige and Essence once a week; none below the level it
/// opens at. Its Shapes are counted apart (`week_shapes`).
#[must_use]
pub fn week_dungeon(which: crate::activities::Weekly, level: u8) -> Option<Hour> {
    let foes_at = which.foes_at();
    if level + 2 < foes_at {
        return None;
    }
    let runs = elite_run(foes_at, which.tier()).times(runs_an_hour(level, foes_at) * which.run_again_share());
    let first = vestiges(1.0, shares(which.colours(), foes_at));
    Some(runs.plus(weekly(Hour { essence: 2.0 * f64::from(which.essence()), ..first })))
}

/// An hour at sea at `level`, at Normal: ships sighted and sunk, each paying `SINKING_KILLS` kills of its rank, its
/// first piece one kill's drop, its pieces their salvage (`ship::found::holds`), an Elite's or better's chest rolled a
/// rank up. A boarding's hold is not counted.
#[must_use]
pub fn sea(level: u8) -> Hour {
    let tier = Difficulty::Normal;
    let ranks = SEA_RANKS.iter().rev().find(|(from, _)| *from <= level).map_or(SEA_RANKS[0].1, |(_, ranks)| *ranks);
    let piece = |rank: u8, chest: bool, count: f64| {
        let held = holds(Source::Flotsam { rank, chest });
        let commons = f64::from(held.commons) * f64::from(held.each[0] + held.each[1]) / 2.0;
        // A module is rolled at its colour, never opened as a Vestige is (`ship::found::salvage`).
        let module =
            Hour { items: shares(colours(rank), level).map(|part| part * held.module * count), ..Hour::default() };
        Hour { materials: (commons + held.heartwood) * count, ..module }
    };
    let sinking = ranks.iter().zip(1_u8..).fold(Hour::default(), |sum, (&share, rank)| {
        let foe = SEA_FOES[usize::from(rank - 1)];
        let found = worth(foe, rank);
        let pay = paid((found.xp * SINKING_KILLS, found.aurem * SINKING_KILLS), level, tier);
        let colour = shares(colours(rank), level);
        let drop = vestiges(chance(rank), colour).plus(items(item_chance(rank), colour, level));
        let chest = if rank >= 3 { 1.0 } else { 0.0 };
        let pieces = piece(rank, false, SEA_PIECES[usize::from(rank - 1)] - chest).plus(piece(rank + 1, true, chest));
        sum.plus(pay.plus(drop).plus(pieces).times(share))
    });
    sinking.times(3_600.0 / (SIGHTING_SECONDS + SEA_FIGHT_SECONDS))
}

/// A passage zone's band of foe levels at a depth, as `passage::levels` raises the island's.
#[must_use]
pub fn passage_levels((low, high): (u8, u8), depth: u8) -> (u8, u8) {
    let share = f64::from(depth.clamp(1, DEPTHS) - 1) / f64::from(DEPTHS - 1);
    let rise = libm::round(f64::from(30_u8.saturating_sub(high)) * share * share) as u8;
    (low.saturating_add(rise).min(32), high.saturating_add(rise).min(32))
}

/// The deepest a player of `level` reaches: where no foe stands four levels over them, whose blows would do nothing.
#[must_use]
pub fn deepest(level: u8) -> u8 {
    (1..=DEPTHS).take_while(|&depth| passage_levels(PASSAGE_BAND, depth).1 < level + 4).last().unwrap_or(0)
}

/// The depths a player of `level` plays for their pay: from the first whose highest foe stands at their level or over
/// it to the deepest they reach. A shallower zone is walked through, as an island below a player's is, and pays at its
/// foes' level.
#[must_use]
pub fn depths(level: u8) -> std::ops::RangeInclusive<u8> {
    let first = (1..=DEPTHS).find(|&depth| passage_levels(PASSAGE_BAND, depth).1 >= level).unwrap_or(DEPTHS);
    first.min(deepest(level))..=deepest(level)
}

/// What one zone's deal pays as its cache at a depth and level, each deal as often as the web deals it (skirmish 30,
/// mission 35, vault 10, vein 12, reliquary 13 in a hundred, `passage::web::DEALS`, a vault under ground alone, half
/// the zones, else a skirmish), its finds raised by depth.
fn cache(depth: u8, level: u8) -> Hour {
    let tier = Difficulty::Normal;
    let (pays, finds) = (pay_times(depth), find_times(depth));
    let raised = |(xp, aurem): (u32, u32)| paid((xp, aurem), level, tier).times(pays);
    let elite = shares(colours(3), level);
    let found = |chance: f64, colour| vestiges(if chance >= 1.0 { 1.0 } else { (chance * finds).min(1.0) }, colour);
    let skirmish = raised(SKIRMISH_PAY).plus(found(SKIRMISH_VESTIGE, elite));
    let mission = raised(MISSION_PAY).plus(found(MISSION_VESTIGE, elite));
    let miniboss = shares(colours(4), level);
    let reeve = kill(Foe::Captain, 4, level, tier).times(KILL_SHARE);
    let vault = raised(VAULT_PAY).plus(found(chance(4), miniboss)).plus(items(VAULT_ITEM, miniboss, level)).plus(reeve);
    let vein = Hour { materials: 6.0 * f64::from(NODE_YIELD) + f64::from(VEIN_FRAGMENTS), ..raised(VEIN_PAY) };
    let (least, most) = RELIQUARY_FRAGMENTS;
    let reliquary = Hour {
        materials: f64::from(least + most) / 2.0,
        ..raised(RELIQUARY_PAY).plus(found(RELIQUARY_VESTIGE, elite))
    };
    [(skirmish, 0.35), (mission, 0.35), (vault, 0.05), (vein, 0.12), (reliquary, 0.13)]
        .into_iter()
        .fold(Hour::default(), |sum, (hour, share)| sum.plus(hour.times(share)))
}

/// A passage zone's bands at a depth as they pay, each member as likely, by kind and rank, and the kinds of the
/// Elites that lead them (`room::passage_foes`'s rosters off a strand): the patrol's Minors and Majors to depth 5, the
/// Enforcer among them to 10, Majors alone past it; the Enforcer and the Marksman leading, the Tithe-Taker past 10 and
/// the Reeve past 15. A strand's deck crew pays as near as makes no odds.
#[must_use]
pub fn passage_roster(depth: u8) -> (&'static [(Foe, u8)], &'static [Foe]) {
    use Foe::{Archer, Brute, Captain, Skirmisher, Swordsman};
    const SHALLOW: [(Foe, u8); 6] =
        [(Skirmisher, 1), (Skirmisher, 2), (Swordsman, 1), (Swordsman, 2), (Archer, 1), (Archer, 2)];
    const MIDDLE: [(Foe, u8); 6] =
        [(Skirmisher, 1), (Skirmisher, 2), (Swordsman, 2), (Archer, 1), (Archer, 2), (Brute, 2)];
    const DEEP: [(Foe, u8); 5] = [(Skirmisher, 2), (Swordsman, 2), (Archer, 2), (Brute, 2), (Swordsman, 2)];
    match depth {
        0..=5 => (&SHALLOW, &[Brute, Archer]),
        6..=10 => (&MIDDLE, &[Brute, Archer]),
        11..=15 => (&DEEP, &[Brute, Archer, Captain]),
        _ => (&DEEP, &[Brute, Archer, Captain, Captain]),
    }
}

/// A passage zone's foes at a depth: its roster's, an Elite leading every third band from depth 6 and every band
/// from 11, three foes a band (`room::passage_foes`).
fn passage_kill(depth: u8, level: u8) -> Hour {
    let tier = Difficulty::Normal;
    let elites = match depth {
        0..=5 => 0.0,
        6..=10 => 1.0 / 9.0,
        _ => 1.0 / 3.0,
    };
    let (members, kinds) = passage_roster(depth);
    let each = 1.0 / members.len() as f64;
    let band =
        members.iter().fold(Hour::default(), |sum, &(foe, rank)| sum.plus(kill(foe, rank, level, tier).times(each)));
    band.times(1.0 - elites).plus(kill_of(kinds, 3, level, tier).times(elites))
}

/// A lamp's zone at its number: its cache, a sure Vestige, and its guard of its depth's Elites (an Elite band at the
/// first, a Miniboss and an Elite band at the second and third, an Elite Dungeon's Boss and two Elite bands at the
/// fourth).
fn lamp_zone(number: u8, depth: u8, level: u8) -> Hour {
    let tier = Difficulty::Normal;
    let chance = if LAMP_VESTIGE >= 1.0 { 1.0 } else { (LAMP_VESTIGE * find_times(depth)).min(1.0) };
    let paid_cache =
        paid(LAMP_PAY, level, tier).times(pay_times(depth)).plus(vestiges(chance, shares(colours(3), level)));
    let elites = if number >= 4 { 6.0 } else { 3.0 };
    let guard = kill_of(passage_roster(depth).1, 3, level, tier).times(elites * KILL_SHARE);
    let leader = match number {
        0 | 1 => Hour::default(),
        2 | 3 => kill(Foe::Captain, 4, level, tier),
        _ => kill(Foe::Captain, 5, level, tier),
    };
    paid_cache.plus(guard).plus(leader.times(KILL_SHARE))
}

/// The lamps a player of `level` lights in a day and a week: the day's first (a dungeon of the day's clear and a sure
/// Vestige in a Boss's colours) and each of the week's they reach (a Boss's Vestige, Essence from the second, the
/// fourth's roll as the game rolls it, `lamps::FOURTH_LAMP_ROLL`).
fn lamps_paid(level: u8) -> Hour {
    let lamps = deepest(level) / 5;
    if lamps == 0 {
        return Hour::default();
    }
    let at = |number: u8| {
        let (low, high) = passage_levels(PASSAGE_BAND, number * 5);
        ((u16::from(low) + u16::from(high)) / 2) as u8
    };
    let day = daily(day_clear(at(1), Difficulty::Normal));
    let week = (1..=lamps).fold(Hour::default(), |sum, number| {
        let essence = 2.0
            * f64::from(match number {
                1 => 0_u8,
                2 => 1,
                _ => 2,
            });
        let boss = Hour { essence, ..vestiges(1.0, shares(colours(5), at(number))) };
        let roll = if number >= 4 {
            vestiges(1.0, shares(crate::lamps::FOURTH_LAMP_ROLL.colours(), at(number)))
        } else {
            Hour::default()
        };
        sum.plus(boss).plus(roll)
    });
    day.plus(weekly(week))
}

/// An hour in the passages at `depth` for a player of `level`: its zones in turn, a lamp's one in five standing its
/// guard alone, their kills and caches, the haul's finds less the share a death takes at that depth, and the day's and
/// the week's lamps; none at a depth they do not play for its pay (`depths`).
#[must_use]
pub fn passage(depth: u8, level: u8) -> Option<Hour> {
    if !depths(level).contains(&depth) {
        return None;
    }
    let (low, high) = passage_levels(PASSAGE_BAND, depth);
    let foes_at = ((u16::from(low) + u16::from(high)) / 2) as u8;
    let zone_seconds = PASSAGE_SECONDS * slowed(level, foes_at) + PASSAGE_BETWEEN_SECONDS;
    let lamp = lamp_zone(depth.div_ceil(5), depth, foes_at);
    let dealt = passage_kill(depth, foes_at).times(PASSAGE_FOES * KILL_SHARE).plus(cache(depth, foes_at));
    let zone = dealt.times(0.8).plus(lamp.times(0.2));
    let zones = zone.times(3_600.0 / zone_seconds).less_finds(haul_lost(depth));
    Some(zones.plus(lamps_paid(level)))
}

#[cfg(test)]
#[path = "band_tests.rs"]
mod band_tests;
