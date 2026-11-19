//! The Arts, Overlook's subclasses: their spells and Core fragments as `content/arts/arts.json` has them, built into
//! the rules so the rooms and every browser read the same; the Art a player wears and the Core each Art keeps, on
//! their character; and the asks that change them, which the room answers.

use crate::character::Character;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

/// How many Core slots each Art has, and how many fragments it offers.
pub const CORE_SLOTS: usize = 3;
pub const FRAGMENTS: usize = 6;
/// The Art a new player wears: Storm.
pub const FIRST_ART: u8 = 1;

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

/// Everything in `content/arts/arts.json` the rules read.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct ArtsDef {
    pub cast: CastDef,
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

/// The Art a player wears, and each Art's Core by its number less one: in each slot a fragment's place in its Art's
/// list, or none.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct WornArts {
    pub worn: u8,
    pub cores: Vec<[Option<u8>; CORE_SLOTS]>,
}

impl Default for WornArts {
    fn default() -> Self {
        WornArts { worn: FIRST_ART, cores: vec![[None; CORE_SLOTS]; arts().arts.len()] }
    }
}

impl WornArts {
    /// As kept, made whole: an Art the rules do not know is Storm, a Core for every Art, and a fragment that is none
    /// of its Art's, or set twice, taken out.
    #[must_use]
    pub fn kept(mut self) -> Self {
        if arts().art(self.worn).is_none() {
            self.worn = FIRST_ART;
        }
        self.cores.resize(arts().arts.len(), [None; CORE_SLOTS]);
        for core in &mut self.cores {
            for slot in 0..CORE_SLOTS {
                let set = core[slot];
                if set.is_some_and(|fragment| usize::from(fragment) >= FRAGMENTS || core[..slot].contains(&set)) {
                    core[slot] = None;
                }
            }
        }
        self
    }
}

/// What a player asks of their Arts: to wear one, or to set a fragment in a slot of one's Core.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ArtAsk {
    Wear { art: u8 },
    SetCore { art: u8, slot: u8, fragment: u8 },
}

/// Why an Art's ask was refused, by the room's answer number: no such Art, a slot outside 0 to 2, a fragment outside 0
/// to 5, or one set already in another slot of that Art.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ArtRefusal {
    NoSuchArt = 110,
    NoSuchSlot = 111,
    NoSuchFragment = 112,
    FragmentSet = 113,
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
        let core = &mut self.arts.cores[index];
        if core.iter().enumerate().any(|(other, set)| other != usize::from(slot) && *set == Some(fragment)) {
            return Err(ArtRefusal::FragmentSet);
        }
        core[usize::from(slot)] = Some(fragment);
        Ok(())
    }

    /// The Art the player wears.
    #[must_use]
    pub fn art(&self) -> &'static ArtDef {
        let found = arts().art(self.arts.worn);
        found.or_else(|| arts().arts.first()).expect("content/arts holds Arts: its test says so")
    }

    /// An Art's Core, by the Art's number: each slot's fragment, or none.
    #[must_use]
    pub fn core_of(&self, art: u8) -> [Option<u8>; CORE_SLOTS] {
        let index = arts().arts.iter().position(|found| found.id == art);
        index.and_then(|index| self.arts.cores.get(index)).copied().unwrap_or([None; CORE_SLOTS])
    }

    /// A fragment of the worn Art, by its key, if its Core holds it: only the worn Art's Core counts.
    #[must_use]
    pub fn fragment(&self, key: &str) -> Option<&'static FragmentDef> {
        let art = self.art();
        let place = art.core.iter().position(|found| found.key == key)?;
        let held = self.core_of(art.id).contains(&u8::try_from(place).ok());
        held.then(|| &art.core[place])
    }
}
