//! A dive into an island's passages, kept with the character so it goes with them from zone to zone: the island and
//! week whose web it walks, its route, the mouth of the patrol zone it began at, the zone it is in and whether that
//! zone's deal was done while the player was there, the deepest lamp lit, the zones whose caches it was paid, and the
//! haul. What is found in a passage zone (Vestiges picked up, items found as themselves, gathered resources, a cache's
//! fragments and Essence, the cold lantern) goes into the haul, not the character's own; a lamp lit keeps it
//! (`lamps.rs`), a respawn asked for or a leave to any room but the dive's next zone loses it. XP and Aurem are paid at
//! once, as anywhere. The room says which zones there are and which way leads where; this keeps the dive's word.

use crate::character::{Character, Materials, Stuff, UnknownKeys, Vestige};
use crate::item::Item;
use crate::refusal::Refusal;
use serde::{Deserialize, Serialize};

/// The most a haul holds of Vestiges and of items, so a dive never grows a save without end; past them a find is let
/// go, as a full mailbox lets its least go.
pub const HAUL_MOST: usize = 64;

/// The way a dive goes: by the public rooms each zone opens for every player, or by a company's own.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Route {
    #[default]
    Public,
    Company,
}

/// What a dive has found and not yet kept.
#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(default)]
pub struct Haul {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub vestiges: Vec<Vestige>,
    /// Items found as themselves, numbered 0 until kept.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub items: Vec<Item>,
    /// Resources gathered, fragments and Essence: none of its Aurem, which is paid at once.
    pub materials: Materials,
    /// The cold lantern, Lanternfall's bounty's first find (`atheric_bounty.rs`), by its bounty's id.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lantern: Option<String>,
    #[serde(flatten)]
    pub unknown: UnknownKeys,
}

impl Haul {
    /// Whether it holds nothing.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.vestiges.is_empty()
            && self.items.is_empty()
            && self.materials == Materials::default()
            && self.lantern.is_none()
    }
}

/// A dive under way.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub struct Dive {
    /// The island, by its continent's id, and the week whose web it walks (`clock::week_of`).
    pub island: String,
    pub week: u64,
    #[serde(default)]
    pub route: Route,
    /// The mouth of the patrol zone it began at, by its place among the island's.
    #[serde(default)]
    pub mouth: u8,
    /// The zone it is in, by its number in the web, and that zone's depth.
    pub zone: u16,
    #[serde(default)]
    pub depth: u8,
    /// Whether the zone's deal was done while the player was in it, which opens its onward mouths for them.
    #[serde(default)]
    pub done: bool,
    /// The deepest lamp lit this dive, by its number (1 to 4), 0 for none.
    #[serde(default)]
    pub lamp: u8,
    /// The zones whose caches it was paid, each once a dive.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub paid: Vec<u16>,
    #[serde(default)]
    pub haul: Haul,
    /// Whether the player has gone home from a lit lamp: the dive ends as they come into the patrol zone, before the
    /// mouth it began at, keeping what they found on the way out.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub homeward: bool,
    /// Whether the player stands in a passage zone of the dive now, so what they find goes into the haul: set by the
    /// zone's room as they join it, never kept.
    #[serde(skip)]
    pub here: bool,
    #[serde(flatten)]
    pub unknown: UnknownKeys,
}

/// Where a dive begins: the island and week, its route, the patrol zone's mouth, the zone and its depth, and the lamp
/// it begins at, if it begins at one.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Start<'a> {
    pub island: &'a str,
    pub week: u64,
    pub route: Route,
    pub mouth: u8,
    pub zone: u16,
    pub depth: u8,
    pub lamp: Option<u8>,
}

impl Character {
    /// The dive the character stands in now, whose haul takes what they find.
    pub(crate) fn hauling(&mut self) -> Option<&mut Haul> {
        self.passage.as_mut().filter(|dive| dive.here).map(|dive| &mut dive.haul)
    }

    /// Begins a dive at a mouth of an island's patrol zone, its haul empty: at the zone behind the mouth, or at a
    /// lamp's zone where the lamp was lit this week on that island, the lamp counted lit and its zone's cache paid. A
    /// dive under way ends first, its haul lost.
    pub fn begin_dive(&mut self, start: &Start<'_>) -> Result<(), Refusal> {
        let mut lamp = 0;
        if let Some(number) = start.lamp {
            let lit = self.activity.this_week.week == start.week
                && self.activity.this_week.passage_lamps.get(start.island).is_some_and(|lamps| lamps.contains(&number));
            if !lit {
                return Err(Refusal::NoLamp);
            }
            lamp = number;
        }
        self.passage = Some(Dive {
            island: start.island.to_owned(),
            week: start.week,
            route: start.route,
            mouth: start.mouth,
            zone: start.zone,
            depth: start.depth,
            done: false,
            lamp,
            // Its lamp's zone paid its cache the dive that lit it.
            paid: start.lamp.map(|_| start.zone).into_iter().collect(),
            haul: Haul::default(),
            homeward: false,
            here: false,
            unknown: UnknownKeys::new(),
        });
        Ok(())
    }

    /// Goes on from `zone` of an island's week's web, the one the dive is in, through the onward mouth that leads to
    /// `to` at its depth (none for no such mouth): once its deal was done while the player was in it, or at once from
    /// a gauntlet (`open`). The dive is in `to` from now.
    pub fn go_on(
        &mut self,
        (island, week, zone): (&str, u64, u16),
        to: Option<(u16, u8)>,
        open: bool,
    ) -> Result<u16, Refusal> {
        let ours = |dive: &&mut Dive| dive.island == island && dive.week == week && dive.zone == zone && !dive.homeward;
        let dive = self.passage.as_mut().filter(ours).ok_or(Refusal::NoDive)?;
        let (to, depth) = to.ok_or(Refusal::NoSuchMouth)?;
        if !(dive.done || open) {
            return Err(Refusal::DealNotDone);
        }
        (dive.zone, dive.depth, dive.done) = (to, depth, false);
        Ok(to)
    }

    /// Notes the deal of the zone the dive is in as done while the player was in it.
    pub fn dive_deal_done(&mut self, zone: u16) {
        if let Some(dive) = self.passage.as_mut().filter(|dive| dive.zone == zone) {
            dive.done = true;
        }
    }

    /// Whether the dive was paid the zone's cache already; notes it paid when not.
    pub(crate) fn first_cache(&mut self, zone: u16) -> bool {
        let Some(dive) = self.passage.as_mut() else { return false };
        if dive.paid.contains(&zone) {
            return false;
        }
        dive.paid.push(zone);
        true
    }

    /// Empties the haul, as a respawn asked for in a passage zone does: the dive goes on with nothing found.
    pub fn lose_haul(&mut self) {
        if let Some(dive) = self.passage.as_mut() {
            dive.haul = Haul::default();
        }
    }

    /// Ends the dive and loses its haul.
    pub fn end_dive(&mut self) {
        self.passage = None;
    }

    /// Leaves the passages, as joining any room that is not a passage zone of the dive does: a dive gone home, come
    /// into the room holding its island's mouths (`mouths_of`, the island whose mouths the room holds), keeps what was
    /// found since its lamp and answers the mouth it began at; any other loses its haul.
    pub fn leave_passages(&mut self, mouths_of: Option<&str>) -> Option<u8> {
        let home = |dive: &&Dive| dive.homeward && mouths_of == Some(dive.island.as_str());
        let homeward = self.passage.as_ref().filter(home).map(|dive| dive.mouth);
        if homeward.is_some() {
            self.keep_haul_home();
        }
        self.end_dive();
        homeward
    }

    /// A Vestige into the haul, while the player stands in a passage zone: whether it went there.
    pub(crate) fn haul_vestige(&mut self, vestige: &Vestige) -> bool {
        let Some(haul) = self.hauling() else { return false };
        if haul.vestiges.len() < HAUL_MOST {
            haul.vestiges.push(Vestige { id: 0, ..vestige.clone() });
        }
        true
    }

    /// An item found as itself into the haul, while the player stands in a passage zone: whether it went there.
    pub(crate) fn haul_item(&mut self, item: &Item) -> bool {
        let Some(haul) = self.hauling() else { return false };
        if haul.items.len() < HAUL_MOST {
            haul.items.push(Item { id: 0, ..item.clone() });
        }
        true
    }

    /// A material into the haul, while the player stands in a passage zone: how much it took, or none when the
    /// player stands in none.
    pub(crate) fn haul_material(&mut self, what: Stuff, count: u16) -> Option<u16> {
        self.hauling().map(|haul| haul.materials.add(what, count))
    }
}

#[cfg(test)]
#[path = "dive_tests.rs"]
pub(crate) mod dive_tests;
