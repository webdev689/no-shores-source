//! The roster for a browser: every enemy type the rules know, by its number, so a page reads each foe's name, faction,
//! ranks and dress from the rules rather than keeping its own copy.

use foes::{ROSTER, faction};
use serde_json::{Value, json};

/// The roster as JSON, a list in the types' order: each type's number, name, faction (its number and name), domain
/// (land or deck), role (its number and name), the ranks it comes in (their numbers, its plainest first), and its
/// right and left forge layers ("" for none).
#[must_use]
pub fn roster_json() -> String {
    let types = ROSTER.iter().map(|foe_type| {
        let ranks: Vec<u8> = foe_type.ranks.iter().map(|rank| *rank as u8).collect();
        json!({
            "type": foe_type.number,
            "name": foe_type.name,
            "faction": foe_type.faction,
            "faction_name": faction(foe_type.faction).map_or("", |found| found.name),
            "domain": foe_type.domain.name(),
            "role": foe_type.role as u8,
            "role_name": foe_type.role.name(),
            "ranks": ranks,
            "right": foe_type.right,
            "left": foe_type.left,
        })
    });
    Value::Array(types.collect()).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_roster_reads_as_every_type_with_its_faction_ranks_and_hands() {
        let roster: Value = serde_json::from_str(&roster_json()).unwrap();
        let types = roster.as_array().unwrap();
        assert_eq!(types.len(), 18);
        let corvane = &types[17];
        assert_eq!(
            (corvane["type"].as_u64(), corvane["name"].as_str(), corvane["domain"].as_str(), corvane["left"].as_str()),
            (Some(18), Some("High Assessor Corvane"), Some("land"), Some("shield_kite_iron"))
        );
        let thule = &types[11];
        assert_eq!((thule["type"].as_u64(), thule["name"].as_str()), (Some(12), Some("Captain Brannoc Thule")));
        assert_eq!((thule["faction"].as_u64(), thule["faction_name"].as_str()), (Some(1), Some("The Grey Tithe")));
        assert_eq!(
            (thule["domain"].as_str(), thule["role"].as_u64(), thule["ranks"][0].as_u64()),
            (Some("deck"), Some(5), Some(5))
        );
        let archer = &types[15];
        assert_eq!(
            (archer["faction_name"].as_str(), archer["right"].as_str(), archer["left"].as_str()),
            (Some("Pirates"), Some("bow_short_iron"), Some(""))
        );
        assert_eq!(archer["ranks"], json!([1, 2]));
    }
}
