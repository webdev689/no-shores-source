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
}

/// A node's brief.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Brief {
    /// One line on the place's character, for whoever shapes it next.
    pub theme: String,
    pub areas: Vec<AreaBrief>,
}

/// Every node's brief, by node id.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Briefs(pub BTreeMap<String, Brief>);

impl Briefs {
    /// Reads `content/world/briefs.json`.
    pub fn parse(text: &str) -> Result<Self, String> {
        serde_json::from_str(text).map(Self).map_err(|error| format!("the briefs: {error}"))
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
    let area = |kind: AreaKind, name: &str| AreaBrief { kind, name: name.to_owned(), blocks: None };
    let areas = match kind {
        NodeKind::Patrol => vec![area(AreaKind::Landing, "The Landing"), area(AreaKind::Wilds, "The Wilds")],
        _ => vec![area(AreaKind::Entrance, "The Way In"), area(AreaKind::Arena, "The Heart")],
    };
    Brief { theme: String::new(), areas }
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
    fn an_unknown_kind_is_refused() {
        assert!(Briefs::parse(r#"{ "x": { "theme": "", "areas": [{ "kind": "castle", "name": "No" }] } }"#).is_err());
    }
}
