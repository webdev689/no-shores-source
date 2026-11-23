//! The Arts, the game's subclasses: their spells and Core fragments as `content/arts/arts.json` has them, built into
//! the rules so the rooms and every browser read the same; the Art a player wears and the Core each Art keeps, on
//! their character; and the asks that change them, which the room answers.

use crate::character::Character;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// How many Core slots each Art has, and how many fragments it offers.
pub const CORE_SLOTS: usize = 3;
pub const FRAGMENTS: usize = 6;
/// The Art a character kept before wears when theirs is none the rules know: Storm. A new player wears none (0).
pub const FIRST_ART: u8 = 1;
/// The Storm's number, the Art the prologue's wisp gives.
pub const STORM: u8 = 1;
/// An Art's earned bits: the Art (its Anima with it), its first Tenet and its second; and all three.
pub const EARNED_ART: u8 = 1;
pub const EARNED_TENET_ONE: u8 = 2;
pub const EARNED_TENET_TWO: u8 = 4;
pub const ALL_EARNED: u8 = 7;
/// An Art's highest level, at which its spells are as `content/arts/arts.json` writes them.
pub const LEVEL_MOST: u8 = 5;

/// One spell: its words and recharge, and the numbers its kind uses (none it does not, read as 0).
#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SpellDef {
    pub key: String,
    pub name: String,
    pub text: String,
    pub recharge_s: f64,
    pub orbs: u32,
    pub release_over_s: f64,
    pub reach: f64,
    pub speed: f64,
    pub turn_per_s: f64,
    pub life_s: f64,
    pub damage: f64,
    pub radius: f64,
    pub cone_degrees: f64,
    pub heal: f64,
    pub length: f64,
    pub flight_s: f64,
    pub width: f64,
    pub every_s: f64,
    pub heal_share: f64,
    pub roll: f64,
}

/// One Core fragment: its words, and the numbers its change uses (none it does not, read as 0).
#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FragmentDef {
    pub key: String,
    pub name: String,
    pub text: String,
    pub orbs: u32,
    pub charge_times: f64,
    pub cooldown_share: f64,
    pub more_s: f64,
    pub radius: f64,
    pub more_radius: f64,
    pub heal_share: f64,
    pub crit_times: f64,
}

/// An Art: its number, key, name and element (the gear crate's number), its Anima, its two Tenets and its fragments.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct ArtDef {
    pub id: u8,
    pub key: String,
    pub name: String,
    pub element: u8,
    pub anima: SpellDef,
    pub tenets: [SpellDef; 2],
    pub core: Vec<FragmentDef>,
}

impl ArtDef {
    /// The spell cast by an ability: 0 the Anima, 1 and 2 the Tenets.
    #[must_use]
    pub fn spell(&self, ability: u8) -> Option<&SpellDef> {
        match ability {
            0 => Some(&self.anima),
            1 | 2 => self.tenets.get(usize::from(ability - 1)),
            _ => None,
        }
    }

    /// A fragment by its key.
    #[must_use]
    pub fn fragment(&self, key: &str) -> Option<&FragmentDef> {
        self.core.iter().find(|found| found.key == key)
    }
}

/// How a cast goes: the seconds it takes to release, and the share of the Anima each kill gives.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CastDef {
    pub release_s: f64,
    pub anima_kill_share: f64,
}

/// What one rise of an Art costs, beside its Aurem: each stock's fragments and Essence.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
pub struct RiseDef {
    pub aurem: u32,
    pub fragments: u16,
    pub essence: u16,
}

/// How an Art rises from level 1 to `LEVEL_MOST`: the XP each level's bar holds and what each rise costs, the lowest
/// first; and each level's share of a spell's harm and healing (`power`) and of how long it and what it gives last
/// (`lasting`), level 1 first.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct LevelsDef {
    pub xp: [u32; LEVEL_MOST as usize - 1],
    pub rise: [RiseDef; LEVEL_MOST as usize - 1],
    pub power: [f64; LEVEL_MOST as usize],
    pub lasting: [f64; LEVEL_MOST as usize],
}

/// Everything in `content/arts/arts.json` the rules read.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct ArtsDef {
    pub cast: CastDef,
    pub levels: LevelsDef,
    pub arts: Vec<ArtDef>,
}

impl ArtsDef {
    /// An Art by its number.
    #[must_use]
    pub fn art(&self, id: u8) -> Option<&ArtDef> {
        self.arts.iter().find(|art| art.id == id)
    }

    /// What in the file the rules cannot keep, each said in a line; none when all is well.
    #[must_use]
    pub fn problems(&self) -> Vec<String> {
        let mut problems = Vec::new();
        for art in &self.arts {
            if art.core.len() != FRAGMENTS {
                problems.push(format!("{} has {} fragments, not {FRAGMENTS}", art.key, art.core.len()));
            }
            if crate::Element::from_number(art.element).is_none() {
                problems.push(format!("{}'s element {} is none the gear knows", art.key, art.element));
            }
            for spell in [&art.anima, &art.tenets[0], &art.tenets[1]] {
                if spell.recharge_s <= 0.0 {
                    problems.push(format!("{} recharges in no time", spell.key));
                }
            }
        }
        let shares = self.levels.power.iter().chain(&self.levels.lasting);
        let highest = usize::from(LEVEL_MOST - 1);
        let whole = self.levels.power[highest] == 1.0 && self.levels.lasting[highest] == 1.0;
        if shares.clone().any(|share| !(*share > 0.0 && *share <= 1.0)) || !whole {
            problems.push("a level's share is outside (0, 1], or the highest level's is not whole".to_owned());
        }
        if self.levels.xp.contains(&0) {
            problems.push("a level's bar holds no XP".to_owned());
        }
        problems
    }
}

/// The Arts' file built into the rules, read once.
///
/// # Panics
///
/// Never for the file in the repository, which `the_arts_file_reads_whole` reads.
#[must_use]
pub fn arts() -> &'static ArtsDef {
    static READ: OnceLock<ArtsDef> = OnceLock::new();
    READ.get_or_init(|| {
        serde_json::from_str(include_str!("../../../content/arts/arts.json"))
            .expect("content/arts reads: its test says so")
    })
}

/// The Art a player wears (0 none), and for each Art by its number less one: its Core (in each slot a fragment's place
/// in its Art's list, or none), its level, the XP toward its next, the fragments it owns, one bit each by place, and
/// what of it is earned (`EARNED_ART` and the Tenets' bits).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct WornArts {
    pub worn: u8,
    pub cores: Vec<[Option<u8>; CORE_SLOTS]>,
    pub levels: Vec<u8>,
    pub xp: Vec<u32>,
    /// None only in a character kept before fragments were owned, which owns what its Cores held (`kept`).
    #[serde(default)]
    pub owned: Option<Vec<u8>>,
    /// None only in a character kept before Arts were earned, which earned every one (`kept`).
    #[serde(default)]
    pub earned: Option<Vec<u8>>,
    /// Keys this room does not know, from a later room's save, written back as read, so a room rolled back to
    /// this one or later keeps them.
    #[serde(flatten)]
    pub unknown: crate::character::UnknownKeys,
}

impl Default for WornArts {
    fn default() -> Self {
        let count = arts().arts.len();
        WornArts {
            worn: FIRST_ART,
            cores: vec![[None; CORE_SLOTS]; count],
            levels: vec![1; count],
            xp: vec![0; count],
            owned: Some(vec![0; count]),
            earned: None,
            unknown: crate::character::UnknownKeys::new(),
        }
    }
}

impl WornArts {
    /// A new player's: no Art earned, and none worn until a house's road gives one.
    #[must_use]
    pub fn unearned() -> Self {
        let empty = Self::default();
        WornArts { worn: 0, earned: Some(vec![0; empty.levels.len()]), ..empty }
    }

    /// The Test Ground's: every Art earned, at its highest level owning every fragment, so each spell is tried as
    /// written.
    #[must_use]
    pub fn mastered() -> Self {
        let empty = Self::default();
        let count = empty.levels.len();
        let owned = Some(vec![(1 << FRAGMENTS) - 1; count]);
        WornArts { levels: vec![LEVEL_MOST; count], owned, earned: Some(vec![ALL_EARNED; count]), ..empty }
    }

    /// As kept, made whole: an Art worn that the rules do not know is Storm, and one not earned is none; a Core, a
    /// level, XP, owned fragments and earned bits for every Art; a level within 1 to `LEVEL_MOST` and XP within its
    /// bar; a fragment that is none of its Art's, set twice, or not owned taken out. A character kept before fragments
    /// were owned owns those its Cores held, and one kept before Arts were earned earned them all.
    #[must_use]
    pub fn kept(mut self) -> Self {
        let count = arts().arts.len();
        let mut earned = self.earned.take().unwrap_or_else(|| vec![ALL_EARNED; count]);
        earned.resize(count, 0);
        earned.iter_mut().for_each(|bits| *bits &= ALL_EARNED);
        if self.worn != 0 && arts().art(self.worn).is_none() {
            self.worn = FIRST_ART;
        }
        let worn = arts().arts.iter().position(|art| art.id == self.worn);
        if worn.is_some_and(|at| earned[at] & EARNED_ART == 0) {
            self.worn = 0;
        }
        self.earned = Some(earned);
        self.cores.resize(count, [None; CORE_SLOTS]);
        self.levels.resize(count, 1);
        self.xp.resize(count, 0);
        let held = |core: &[Option<u8>; CORE_SLOTS]| {
            core.iter()
                .flatten()
                .filter(|fragment| usize::from(**fragment) < FRAGMENTS)
                .fold(0, |bits, fragment| bits | 1 << fragment)
        };
        let mut owned = self.owned.take().unwrap_or_else(|| self.cores.iter().map(held).collect());
        owned.resize(count, 0);
        for (index, core) in self.cores.iter_mut().enumerate() {
            for slot in 0..CORE_SLOTS {
                let set = core[slot];
                let bad = set.is_some_and(|fragment| {
                    usize::from(fragment) >= FRAGMENTS
                        || core[..slot].contains(&set)
                        || owned[index] & 1 << fragment == 0
                });
                if bad {
                    core[slot] = None;
                }
            }
            self.levels[index] = self.levels[index].clamp(1, LEVEL_MOST);
            self.xp[index] = self.xp[index].min(bar(self.levels[index]));
        }
        self.owned = Some(owned);
        self
    }
}

/// The XP an Art's bar holds at a level: none at the highest.
#[must_use]
pub fn bar(level: u8) -> u32 {
    let at = usize::from(level.max(1) - 1);
    arts().levels.xp.get(at).copied().unwrap_or(0)
}

/// What a player asks of their Arts: to wear one, or to set a fragment in a slot of one's Core.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ArtAsk {
    Wear { art: u8 },
    SetCore { art: u8, slot: u8, fragment: u8 },
}

/// Why an Art's ask was refused, by the room's answer number: no such Art, a slot outside 0 to 2, a fragment outside 0
/// to 5, one set already in another slot of that Art, or one not owned.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ArtRefusal {
    NoSuchArt = 110,
    NoSuchSlot = 111,
    NoSuchFragment = 112,
    FragmentSet = 113,
    /// The fragment is not the player's: it is had by rising the Art, or bought, at its faction's counter.
    NotOwned = 114,
    /// The Art is not the player's to wear: its house's road gives it.
    NotEarned = 115,
}

impl Character {
    /// Carries out an ask of the player's Arts, or says why not, having changed nothing.
    ///
    /// # Errors
    ///
    /// The ask's refusal.
    pub fn ask_art(&mut self, ask: ArtAsk) -> Result<(), ArtRefusal> {
        let (art, slot, fragment) = match ask {
            ArtAsk::Wear { art } => (art, None, None),
            ArtAsk::SetCore { art, slot, fragment } => (art, Some(slot), Some(fragment)),
        };
        let index = arts().arts.iter().position(|found| found.id == art).ok_or(ArtRefusal::NoSuchArt)?;
        let (Some(slot), Some(fragment)) = (slot, fragment) else {
            if self.earned(art) & EARNED_ART == 0 {
                return Err(ArtRefusal::NotEarned);
            }
            self.arts.worn = art;
            return Ok(());
        };
        if usize::from(slot) >= CORE_SLOTS {
            return Err(ArtRefusal::NoSuchSlot);
        }
        if usize::from(fragment) >= FRAGMENTS {
            return Err(ArtRefusal::NoSuchFragment);
        }
        self.arts = std::mem::take(&mut self.arts).kept();
        if !self.owns_fragment(art, fragment) {
            return Err(ArtRefusal::NotOwned);
        }
        let core = &mut self.arts.cores[index];
        if core.iter().enumerate().any(|(other, set)| other != usize::from(slot) && *set == Some(fragment)) {
            return Err(ArtRefusal::FragmentSet);
        }
        core[usize::from(slot)] = Some(fragment);
        Ok(())
    }

    /// The Art the player wears, or the first when they wear none: where none is worn matters, `worn_art`.
    #[must_use]
    pub fn art(&self) -> &'static ArtDef {
        let found = arts().art(self.arts.worn);
        found.or_else(|| arts().arts.first()).expect("content/arts holds Arts: its test says so")
    }

    /// The Art the player wears; none before a house's road gives one.
    #[must_use]
    pub fn worn_art(&self) -> Option<&'static ArtDef> {
        arts().art(self.arts.worn)
    }

    /// What of an Art the player has earned, by the Art's number: `EARNED_ART` and the Tenets' bits; every one for a
    /// character kept before Arts were earned.
    #[must_use]
    pub fn earned(&self, art: u8) -> u8 {
        let Some(at) = arts().arts.iter().position(|found| found.id == art) else { return 0 };
        self.arts.earned.as_ref().map_or(ALL_EARNED, |earned| earned.get(at).copied().unwrap_or(0))
    }

    /// Whether an ability of an Art is earned: 0 its Anima, with the Art; 1 and 2 its Tenets.
    #[must_use]
    pub fn ability_earned(&self, art: u8, ability: u8) -> bool {
        1_u8.checked_shl(u32::from(ability)).is_some_and(|bit| self.earned(art) & bit != 0)
    }

    /// An Art's Core, by the Art's number: each slot's fragment, or none.
    #[must_use]
    pub fn core_of(&self, art: u8) -> [Option<u8>; CORE_SLOTS] {
        let index = arts().arts.iter().position(|found| found.id == art);
        index.and_then(|index| self.arts.cores.get(index)).copied().unwrap_or([None; CORE_SLOTS])
    }

    /// A fragment of the worn Art, by its key, if its Core holds it: only the worn Art's Core counts, and none with no
    /// Art worn.
    #[must_use]
    pub fn fragment(&self, key: &str) -> Option<&'static FragmentDef> {
        self.fragment_of(self.worn_art()?.id, key)
    }

    /// A fragment of the Art numbered `art`, by its key, if that Art's Core holds it, worn or not.
    #[must_use]
    pub fn fragment_of(&self, art: u8, key: &str) -> Option<&'static FragmentDef> {
        held_fragment(art, self.core_of(art), key)
    }
}

/// A fragment of the Art numbered `art`, by its key, if `core` (that Art's slots) holds it: a spell keeps the Core it
/// was cast with, whatever is set after.
#[must_use]
pub fn held_fragment(art: u8, core: [Option<u8>; CORE_SLOTS], key: &str) -> Option<&'static FragmentDef> {
    let art = arts().art(art)?;
    let place = art.core.iter().position(|found| found.key == key)?;
    core.contains(&u8::try_from(place).ok()).then(|| &art.core[place])
}
