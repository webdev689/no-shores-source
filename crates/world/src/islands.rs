//! The islands' names the owner has given, by their continent's id (`content/world/islands.json`, which the page reads
//! too): an island with none yet has its sea locked, as the held map shows it, and no ship sails or travels into it.
use std::collections::BTreeMap;
use std::sync::OnceLock;

/// Each named island's name, by its continent's id.
#[must_use]
pub fn names() -> &'static BTreeMap<String, String> {
    static NAMES: OnceLock<BTreeMap<String, String>> = OnceLock::new();
    NAMES.get_or_init(|| serde_json::from_str(include_str!("../../../content/world/islands.json")).unwrap_or_default())
}

/// Whether the island of the continent `id` is named: one that is not has its sea locked.
#[must_use]
pub fn named(id: &str) -> bool {
    names().contains_key(id)
}

#[cfg(test)]
mod tests {
    #[test]
    fn saltmere_alone_is_named_so_every_other_island_has_its_sea_locked() {
        assert_eq!(super::names().get("continent-1").map(String::as_str), Some("Saltmere"));
        assert!(super::named("continent-1"));
        assert!((2..=9).all(|n| !super::named(&format!("continent-{n}"))), "the other eight seas are locked");
    }
}
