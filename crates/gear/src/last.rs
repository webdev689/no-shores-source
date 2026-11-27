//! Where a player logs back in: wherever they last left the overworld or a social space. The sea
//! writes the sea, its ship lying where `ship_at` keeps it; a social space's room writes itself and where they stood.
//! No other room writes it, so one who logs out in a patrol zone, a dungeon or on an island comes back to whichever of
//! the two they were in last.

use serde::{Deserialize, Serialize};

/// The place a player logs back in at.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Last {
    /// At sea, aboard their ship where the sea last kept it.
    Sea,
    /// On foot in a social space: its node's id, where their feet stood (x east, y south, z up) in whole centimetres,
    /// and the way they faced in thousandths of a radian clockwise from north.
    Social { node: String, at: [i64; 3], facing: i64 },
}

impl Last {
    /// On foot in the social space `node`, standing at `at` (metres) facing `facing` (radians).
    #[must_use]
    pub fn social(node: &str, at: [f64; 3], facing: f64) -> Self {
        let centimetres = at.map(|metres| (metres * 100.0).round() as i64);
        Last::Social { node: node.to_owned(), at: centimetres, facing: (facing * 1000.0).round() as i64 }
    }

    /// Where a player stood in the social space `node` as they left it, in metres and radians; none for the sea or
    /// another social space.
    #[must_use]
    pub fn stood_in(&self, node: &str) -> Option<([f64; 3], f64)> {
        let Last::Social { node: left, at, facing } = self else { return None };
        (left == node).then(|| (at.map(|centimetres| centimetres as f64 / 100.0), *facing as f64 / 1000.0))
    }
}

#[cfg(test)]
mod tests {
    use super::Last;
    use crate::Character;

    #[test]
    fn a_character_keeps_where_it_last_left_the_sea_or_a_social_space_and_an_older_save_reads_none() {
        let mut character = Character::starting();
        assert_eq!(Character::from_json(&character.to_json()).map(|read| read.last), Some(None), "none before");
        let at = Last::social("overlook-social", [12.504, -3.25, 4.0], 1.5);
        character.last = Some(at.clone());
        let text = character.to_json();
        let written: serde_json::Value = serde_json::from_str(&text).expect("JSON");
        let kept =
            serde_json::json!({ "kind": "social", "node": "overlook-social", "at": [1250, -325, 400], "facing": 1500 });
        assert_eq!(written["last"], kept, "whole centimetres and thousandths of a radian");
        assert_eq!(Character::from_json(&text).and_then(|read| read.last), Some(at.clone()));
        assert_eq!(at.stood_in("overlook-social"), Some(([12.5, -3.25, 4.0], 1.5)), "to the centimetre");
        assert_eq!(at.stood_in("sunspire-social"), None, "another social space");
        assert_eq!(Last::Sea.stood_in("overlook-social"), None);
        character.last = Some(Last::Sea);
        let written: serde_json::Value = serde_json::from_str(&character.to_json()).expect("JSON");
        assert_eq!(written["last"], serde_json::json!({ "kind": "sea" }));
        assert!(!Character::starting().to_json().contains(r#""last""#), "written only once it is known");
    }
}
