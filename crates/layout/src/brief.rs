//! A node's brief: the areas its layout holds, by kind and name, in the order they are placed, so each patrol area and
//! instance has a character of its own while the land decides where each part stands. Kept for every node in
//! `content/world/briefs.json`, read by the bake and the browser alike.

use serde::Deserialize;
use std::collections::BTreeMap;

/// What an area of a layout is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AreaKind {
    /// Where players arrive: open ground by the shore, a jetty if the shore is near.
    Landing,
    /// Where an instance is entered from its patrol area's gate.
    Entrance,
    /// A few RMB blocks of houses, a tavern and a shop or a temple.
    Hamlet,
    /// A farmstead and its fields.
    Farm,
    /// A ruin's RMB block.
    Ruin,
    /// A castle keep standing alone: an outpost.
    Keep,
    /// A graveyard and its crypts.
    Graveyard,
    /// A witches' coven.
    Coven,
    /// A shrine of standing stones round an altar.
    Shrine,
    /// A camp behind a palisade: tents, a fire, stores.
    Camp,
    /// A watchtower on high ground.
    Tower,
    /// A lighthouse on the shore.
    Lighthouse,
    /// Open ground with rocks for cover, where public events are fought.
    Wilds,
    /// A jetty and its stores on the shore.
    Dock,
    /// A mill by fresh water.
    Mill,
    /// A quarry or mine cut into a slope.
    Quarry,
    /// A wreck on the shore.
    Wreck,
    /// The bones of something enormous.
    Bones,
    /// A causeway of stone over low or wet ground.
    Causeway,
    /// A cave's mouth in a slope.
    Cave,
    /// The arena an instance ends in.
    Arena,
    /// A way from a patrol area into an instance, at the patrol area's edge.
    Gate,
    /// A graveyard of ships: hulls driven up and left to rot, and the wreckage strewn between them.
    Hulks,
    /// The ground a guild builds its outpost on: a level square, nothing standing on it.
    Plot,
    /// A Breach's gate: the hollow its opening is fought in, sunk in the land before a cliff and its sealed doorway.
    Breach,
}

/// One area a brief asks for.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AreaBrief {
    pub kind: AreaKind,
    pub name: String,
    /// How many RMB blocks a hamlet stands, 1 to 4.
    #[serde(default)]
    pub blocks: Option<u8>,
    /// Where its brief asks for heights, its floor's level in hundredths of the massif's height, in place of its
    /// kind's (`heights::level_of`).
    #[serde(default)]
    pub level: Option<u8>,
}

/// What a run is: one in the open (a gorge, a ledge up a face, a rampart along the top) or through a large building
/// (a keep, a mine, an undercroft).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RunKind {
    Gorge,
    Ledge,
    Rampart,
    Keep,
    Mine,
    Undercroft,
}

impl RunKind {
    /// Whether the run passes through a large building rather than open ground.
    #[must_use]
    pub const fn building(self) -> bool {
        matches!(self, Self::Keep | Self::Mine | Self::Undercroft)
    }
}

/// Where a run goes: into the zone's own rock, or out past its edge into the land beyond.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RunPlace {
    Rock,
    Beyond,
}

/// One linear combat area a brief asks for, breaking off its zone.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunBrief {
    pub name: String,
    pub kind: RunKind,
    pub place: RunPlace,
}

/// A node's brief.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Brief {
    /// One line on the place's character, for whoever shapes it next.
    pub theme: String,
    pub areas: Vec<AreaBrief>,
    #[serde(default)]
    pub runs: Vec<RunBrief>,
    /// The shape its outcrops stand in, where its climate's would not suit it (`carve::shape_of`).
    #[serde(default)]
    pub rock: Option<land::sculpts::Shape>,
    /// The stone its cliffs and rubble wear, where it is not its climate's.
    #[serde(default)]
    pub stone: Option<String>,
    /// Whether a river runs through it.
    #[serde(default)]
    pub river: bool,
    /// Whether its places stand at heights by their kind, its ways graded between them (`heights`).
    #[serde(default)]
    pub heights: bool,
    /// The region of its island it lies in (`content/world/regions.json`, read by `Briefs::regions`): an instance
    /// links only to a patrol area of its own region.
    #[serde(default)]
    pub region: Option<String>,
}

/// Every node's brief, by node id.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Briefs(pub BTreeMap<String, Brief>);

impl Briefs {
    /// Reads `content/world/briefs.json`.
    pub fn parse(text: &str) -> Result<Self, String> {
        serde_json::from_str(text).map(Self).map_err(|error| format!("the briefs: {error}"))
    }

    /// Reads `content/world/regions.json` into the briefs: each briefed node's region, by the region's name.
    pub fn regions(&mut self, text: &str) -> Result<(), String> {
        #[derive(Deserialize)]
        struct Island {
            regions: Vec<Region>,
        }
        #[derive(Deserialize)]
        struct Region {
            name: String,
            nodes: Vec<String>,
        }
        let islands: Vec<Island> = serde_json::from_str(text).map_err(|error| format!("the regions: {error}"))?;
        for region in islands.iter().flat_map(|island| &island.regions) {
            for id in &region.nodes {
                if let Some(brief) = self.0.get_mut(id) {
                    brief.region = Some(region.name.clone());
                }
            }
        }
        Ok(())
    }

    /// The region a node lies in, where the regions name it.
    #[must_use]
    pub fn region_of(&self, id: &str) -> Option<&str> {
        self.0.get(id).and_then(|brief| brief.region.as_deref())
    }

    /// A node's brief, or the plainest one for its kind when it has none.
    #[must_use]
    pub fn of(&self, id: &str, kind: land::sites::NodeKind) -> Brief {
        self.0.get(id).cloned().unwrap_or_else(|| plain(kind))
    }
}

/// A brief for a node no one has written one for: open ground to arrive on and fight over.
fn plain(kind: land::sites::NodeKind) -> Brief {
    use land::sites::NodeKind;
    let area = |kind: AreaKind, name: &str| AreaBrief { kind, name: name.to_owned(), blocks: None, level: None };
    let areas = match kind {
        NodeKind::Patrol => vec![area(AreaKind::Landing, "The Landing"), area(AreaKind::Wilds, "The Wilds")],
        NodeKind::Outpost => vec![
            area(AreaKind::Landing, "The Landing"),
            area(AreaKind::Plot, "The Plot"),
            area(AreaKind::Arena, "The Muster Ground"),
        ],
        _ => vec![area(AreaKind::Entrance, "The Way In"), area(AreaKind::Arena, "The Heart")],
    };
    Brief {
        theme: String::new(),
        areas,
        runs: Vec::new(),
        rock: None,
        stone: None,
        river: false,
        heights: false,
        region: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use land::sites::NodeKind;

    #[test]
    fn a_brief_is_read_by_its_node_and_a_missing_one_is_plain() {
        let briefs = Briefs::parse(
            r#"{ "downs": { "theme": "Sheep and salt wind.", "areas": [
                { "kind": "landing", "name": "Gull Cove" }, { "kind": "hamlet", "name": "Saltgrass", "blocks": 3 } ] } }"#,
        )
        .unwrap();
        let downs = briefs.of("downs", NodeKind::Patrol);
        assert_eq!(downs.areas[1].kind, AreaKind::Hamlet);
        assert_eq!(downs.areas[1].blocks, Some(3));
        assert_eq!(briefs.of("elsewhere", NodeKind::Mission).areas[0].kind, AreaKind::Entrance);
    }

    #[test]
    fn saltmeres_zone_has_three_runs_of_both_kinds_and_places() {
        let text = include_str!("../../../content/world/briefs.json");
        let briefs = Briefs::parse(text).unwrap_or_default();
        let runs = briefs.of("saltgrass-downs", NodeKind::Patrol).runs;
        assert_eq!(runs.len(), 3);
        assert!(runs.iter().any(|run| run.kind.building()) && runs.iter().any(|run| !run.kind.building()));
        assert!(runs.iter().any(|run| run.place == RunPlace::Rock));
        assert!(runs.iter().any(|run| run.place == RunPlace::Beyond));
    }

    #[test]
    fn an_unknown_kind_is_refused() {
        assert!(Briefs::parse(r#"{ "x": { "theme": "", "areas": [{ "kind": "castle", "name": "No" }] } }"#).is_err());
    }
}
