//! What is on, drawn by the day and the week: each island's dungeon of the day and the day's modifier, and the week's
//! Elite and Abyss Dungeons with their modifiers. Every draw is seeded by the clock's day or week number alone, so
//! every room and every page sees the same.

use crate::arts::arts;
use crate::dice::Dice;
use crate::world::Difficulty;

/// An Elite Dungeon: its node's id, the Forge's style key it is laid in (`dungeon::style_of`), and its Boss's type
/// (`foes::roster`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EliteDungeon {
    pub id: &'static str,
    pub style: &'static str,
    pub boss: u8,
}

/// An island's places as the draws know them: its continent, its three patrols and its two Elite Dungeons, each in its
/// land file's order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Island {
    pub continent: &'static str,
    pub patrols: [&'static str; 3],
    pub elite: [EliteDungeon; 2],
}

const fn elite(id: &'static str, style: &'static str, boss: u8) -> EliteDungeon {
    EliteDungeon { id, style, boss }
}

/// Every island's places, in the order of `world::ISLANDS`.
pub const ISLAND_PLACES: [Island; 9] = [
    Island {
        continent: "continent-1",
        patrols: ["saltgrass-downs", "gullwing-vale", "driftwood-moors"],
        elite: [elite("krakens-grotto", "caverns", 19), elite("pearl-tomb", "crypt", 20)],
    },
    Island {
        continent: "continent-2",
        patrols: ["highwater-fells", "highwater-glen", "greystone-tors"],
        elite: [elite("cinder-deep", "mines", 21), elite("hollow-crypt", "crypt", 22)],
    },
    Island {
        continent: "continent-3",
        patrols: ["elder-thicket", "hollow-dells", "oakshade-weald"],
        elite: [elite("black-tide-caverns", "caverns", 23), elite("pale-undercroft", "sanctum", 24)],
    },
    Island {
        continent: "continent-4",
        patrols: ["ochre-wastes", "sunscorched-barrens", "scorpion-erg"],
        elite: [elite("forsaken-cistern", "halls", 25), elite("sandworn-vault", "halls", 26)],
    },
    Island {
        continent: "continent-5",
        patrols: ["lion-grasslands", "baobab-grasslands", "thunderhoof-grasslands"],
        elite: [elite("smugglers-labyrinth", "cells", 27), elite("silt-barrows", "crypt", 28)],
    },
    Island {
        continent: "continent-6",
        patrols: ["emerald-tangle", "vinewood-basin", "rainshadow-canopy"],
        elite: [elite("deepwater-vault", "halls", 29), elite("coral-halls", "halls", 30)],
    },
    Island {
        continent: "continent-7",
        patrols: ["kurgan-plateau", "horsehead-mounds", "greywind-steppe"],
        elite: [elite("barrow-halls", "crypt", 31), elite("saltworm-warrens", "mines", 32)],
    },
    Island {
        continent: "continent-8",
        patrols: ["bogmire-sloughs", "sunken-fen", "blackwater-marsh"],
        elite: [elite("mire-hollows", "caverns", 33), elite("rotwater-sewers", "cells", 34)],
    },
    Island {
        continent: "continent-9",
        patrols: ["whitewind-tundra", "pale-wastes", "aurora-wastes"],
        elite: [elite("frozen-sepulchre", "sanctum", 35), elite("brine-catacombs", "crypt", 36)],
    },
];

/// The island a patrol or an Elite Dungeon is on; none for any other place.
#[must_use]
pub fn island_of(place: &str) -> Option<&'static Island> {
    ISLAND_PLACES
        .iter()
        .find(|island| island.patrols.contains(&place) || island.elite.iter().any(|elite| elite.id == place))
}

/// An Elite Dungeon by its node's id; none for any other place.
#[must_use]
pub fn elite_dungeon(place: &str) -> Option<&'static EliteDungeon> {
    elite_dungeons().find(|elite| elite.id == place)
}

/// The 18 Elite Dungeons, island by island.
pub fn elite_dungeons() -> impl Iterator<Item = &'static EliteDungeon> {
    ISLAND_PLACES.iter().flat_map(|island| island.elite.iter())
}

/// A rule a run changes, each one hook in the room (`room::run`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Modifier {
    /// One Art, by its number: its spells deal twice, and its wearers take twice from foes.
    Burn(u8),
    Brawler,
    Marksman,
    Lightswitch,
    Ironclad,
    Trickle,
    Juggler,
    Exposure,
}

/// How many kinds of modifier there are.
pub const MODIFIER_KINDS: usize = 8;
/// What the burning Art's spells deal, and what its wearers take from foes, times.
pub const BURN_TIMES: f64 = 2.0;
/// What a player's swing deals under Brawler, times.
pub const BRAWLER_TIMES: f64 = 1.5;
/// What a player's shot deals under Marksman, times.
pub const MARKSMAN_TIMES: f64 = 1.5;
/// What a foe's swing or telegraphed blow deals a player under Lightswitch, times.
pub const LIGHTSWITCH_TIMES: f64 = 2.0;
/// The share of foes that stand with a shield under Ironclad, against `element::SHIELD_CHANCE`.
pub const IRONCLAD_SHIELDS: f64 = 0.5;
/// How much longer an Art takes to recharge under Trickle, times.
pub const TRICKLE_TIMES: f64 = 1.5;
/// What a heal gives under Exposure, times.
pub const EXPOSURE_TIMES: f64 = 0.5;

impl Modifier {
    /// Its place in the set: Burn 0 to Exposure 7.
    #[must_use]
    pub fn kind(self) -> usize {
        match self {
            Modifier::Burn(_) => 0,
            Modifier::Brawler => 1,
            Modifier::Marksman => 2,
            Modifier::Lightswitch => 3,
            Modifier::Ironclad => 4,
            Modifier::Trickle => 5,
            Modifier::Juggler => 6,
            Modifier::Exposure => 7,
        }
    }

    /// The modifier of a kind (`kind`), Burn naming the Art `art`.
    fn of_kind(kind: usize, art: u8) -> Self {
        match kind {
            0 => Modifier::Burn(art),
            1 => Modifier::Brawler,
            2 => Modifier::Marksman,
            3 => Modifier::Lightswitch,
            4 => Modifier::Ironclad,
            5 => Modifier::Trickle,
            6 => Modifier::Juggler,
            _ => Modifier::Exposure,
        }
    }

    /// Its key, as the page reads it: "burn-shadow", "brawler", and so on.
    #[must_use]
    pub fn key(self) -> String {
        match self {
            Modifier::Burn(art) => format!("burn-{}", arts().art(art).map_or("", |found| found.key.as_str())),
            other => other.name().to_lowercase(),
        }
    }

    /// Its name, as the player reads it: "Burn (Shadow)", "Brawler", and so on.
    #[must_use]
    pub fn name(self) -> String {
        let named = match self {
            Modifier::Burn(art) => {
                return format!("Burn ({})", arts().art(art).map_or("", |found| found.name.as_str()));
            }
            Modifier::Brawler => "Brawler",
            Modifier::Marksman => "Marksman",
            Modifier::Lightswitch => "Lightswitch",
            Modifier::Ironclad => "Ironclad",
            Modifier::Trickle => "Trickle",
            Modifier::Juggler => "Juggler",
            Modifier::Exposure => "Exposure",
        };
        named.to_owned()
    }

    /// What it does, in a short plain line for the player, each line saying its constant above.
    #[must_use]
    pub fn words(self) -> String {
        let said = match self {
            Modifier::Burn(art) => {
                let named = arts().art(art).map_or("", |found| found.name.as_str());
                return format!("{named} spells deal double damage. Wearing {named}, you take double.");
            }
            Modifier::Brawler => "Melee deals 50% more damage.",
            Modifier::Marksman => "Ranged deals 50% more damage.",
            Modifier::Lightswitch => "Foes' melee deals double damage.",
            Modifier::Ironclad => "Half of all foes carry shields.",
            Modifier::Trickle => "Arts take 50% longer to recharge.",
            Modifier::Juggler => "No ammunition drops.",
            Modifier::Exposure => "Heals restore half as much.",
        };
        said.to_owned()
    }
}

/// One of the week's two dungeons.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Weekly {
    Elite,
    Abyss,
}

impl Weekly {
    /// The week's dungeon run at a tier; none at Normal.
    #[must_use]
    pub fn of(tier: Difficulty) -> Option<Self> {
        match tier {
            Difficulty::Normal => None,
            Difficulty::Elite => Some(Weekly::Elite),
            Difficulty::Abyss => Some(Weekly::Abyss),
        }
    }

    /// The tier it is run at.
    #[must_use]
    pub const fn tier(self) -> Difficulty {
        match self {
            Weekly::Elite => Difficulty::Elite,
            Weekly::Abyss => Difficulty::Abyss,
        }
    }

    /// The level every foe in it stands at, whatever the island's band.
    #[must_use]
    pub const fn foes_at(self) -> u8 {
        match self {
            Weekly::Elite => 26,
            Weekly::Abyss => 30,
        }
    }

    /// The level that opens it: two under its foes', so a player who may enter can harm every foe.
    #[must_use]
    pub const fn opens_at(self) -> u8 {
        self.foes_at() - 2
    }

    /// Its name on screen.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Weekly::Elite => "Elite Dungeon of the week",
            Weekly::Abyss => "Abyss Dungeon of the week",
        }
    }
}

/// The draws' own seed, apart from every room's ("ACTIVITY"); the kind of draw is the dice's tick.
const DRAWS: u64 = 0x4143_5449_5649_5459;
/// The kinds of draw: the day's dungeons, the day's modifier, the week's dungeons and the week's modifiers, and the
/// board's bounties.
const DAY_DUNGEONS: u64 = 0;
const DAY_MODIFIER: u64 = 1;
const WEEK_DUNGEONS: u64 = 2;
const WEEK_MODIFIERS: u64 = 3;
/// The board's bounties.
pub(crate) const BOUNTY_DRAWS: u64 = 4;

/// The number the draws roll by, their place among a kind's added: any would do, as their own seed keeps them apart
/// from every room's dice.
const DRAW: u32 = 12;

/// One of `count`, drawn for a day or a week by the kind of draw and its place among that kind's draws.
pub(crate) fn drawn(period: u64, kind: u64, nth: u32, count: usize) -> usize {
    let roll = Dice { seed: DRAWS ^ period, tick: kind, player: 0 }.roll_numbered(DRAW + nth);
    ((roll * count as f64) as usize).min(count.saturating_sub(1))
}

/// The Art a Burn drawn at `nth` names.
fn burning(period: u64, kind: u64, nth: u32) -> u8 {
    let every = &arts().arts;
    every.get(drawn(period, kind, nth, every.len())).map_or(0, |art| art.id)
}

/// The patrol an island's dungeon of the day is in and its number there; none for a continent with no island.
#[must_use]
pub fn dungeon_of_the_day(day: u64, continent: &str) -> Option<(&'static str, usize)> {
    let index = ISLAND_PLACES.iter().position(|island| island.continent == continent)?;
    let pick = drawn(day, DAY_DUNGEONS, u32::try_from(index).ok()?, 9);
    Some((ISLAND_PLACES[index].patrols[pick / 3], pick % 3))
}

/// The modifier every dungeon of the day carries at Elite and Abyss.
#[must_use]
pub fn modifier_of_the_day(day: u64) -> Modifier {
    Modifier::of_kind(drawn(day, DAY_MODIFIER, 0, MODIFIER_KINDS), burning(day, DAY_MODIFIER, 1))
}

/// The week's Elite Dungeon and its Abyss Dungeon, never the same one.
#[must_use]
pub fn week_dungeons(week: u64) -> (&'static EliteDungeon, &'static EliteDungeon) {
    let every: Vec<&'static EliteDungeon> = elite_dungeons().collect();
    let elite = drawn(week, WEEK_DUNGEONS, 0, every.len());
    let other = drawn(week, WEEK_DUNGEONS, 1, every.len() - 1);
    let abyss = if other >= elite { other + 1 } else { other };
    (every[elite], every[abyss])
}

/// The week's Elite or Abyss Dungeon.
#[must_use]
pub fn of_the_week(week: u64, weekly: Weekly) -> &'static EliteDungeon {
    let (elite, abyss) = week_dungeons(week);
    match weekly {
        Weekly::Elite => elite,
        Weekly::Abyss => abyss,
    }
}

/// The week's Elite Dungeon's one modifier, or its Abyss Dungeon's three, each of a different kind.
#[must_use]
pub fn week_modifiers(week: u64, weekly: Weekly) -> Vec<Modifier> {
    match weekly {
        Weekly::Elite => {
            vec![Modifier::of_kind(drawn(week, WEEK_MODIFIERS, 0, MODIFIER_KINDS), burning(week, WEEK_MODIFIERS, 1))]
        }
        Weekly::Abyss => {
            let art = burning(week, WEEK_MODIFIERS, 5);
            let mut left: Vec<usize> = (0..MODIFIER_KINDS).collect();
            let drawn_kinds = [2, 3, 4].map(|nth| {
                let count = left.len();
                left.remove(drawn(week, WEEK_MODIFIERS, nth, count))
            });
            drawn_kinds.into_iter().map(|kind| Modifier::of_kind(kind, art)).collect()
        }
    }
}
