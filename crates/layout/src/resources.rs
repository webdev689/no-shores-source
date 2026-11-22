//! Each island's resource, as the gear's catalogue names it (content/gear/resources.json): what its resource sites
//! hold, and what stands at them.

use serde::Deserialize;
use std::sync::OnceLock;

#[derive(Deserialize)]
struct Listed {
    id: String,
    continent: String,
}

#[derive(Deserialize)]
struct Resources {
    resources: Vec<Listed>,
}

/// The resource of the island a landmass is, by its continent's id; none for land with none.
#[must_use]
pub fn of(continent: &str) -> Option<&'static str> {
    static LISTED: OnceLock<Vec<Listed>> = OnceLock::new();
    let listed = LISTED.get_or_init(|| {
        let text = include_str!("../../../content/gear/resources.json");
        serde_json::from_str::<Resources>(text).map(|file| file.resources).unwrap_or_default()
    });
    listed.iter().find(|each| each.continent == continent).map(|each| each.id.as_str())
}

#[cfg(test)]
mod tests {
    #[test]
    fn each_island_has_its_own_resource_and_other_land_none() {
        assert_eq!(super::of("continent-1"), Some("brineglass"), "Saltmere's");
        assert_eq!(super::of("continent-9"), Some("rimecrystal"), "Rimeholt's");
        assert_eq!(super::of("nowhere"), None);
    }
}
