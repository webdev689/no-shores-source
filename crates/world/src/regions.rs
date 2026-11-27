//! Each island's three regions (`content/world/regions.json`, which the page reads too): a region's centre, the
//! anchorage off its coast and the nodes ashore in it. Leaving a node of a region puts the ship off that region.
use serde::Deserialize;
use std::sync::OnceLock;

/// One region of an island, in world metres.
#[derive(Debug, Deserialize)]
pub struct Region {
    /// The continent's id of the island it is a region of.
    #[serde(skip)]
    pub island: String,
    pub name: String,
    pub centre: [f64; 2],
    pub anchorage: [f64; 2],
    pub nodes: Vec<String>,
}

#[derive(Deserialize)]
struct Island {
    island: String,
    regions: Vec<Region>,
}

/// Every island's regions.
#[must_use]
pub fn all() -> &'static [Region] {
    static REGIONS: OnceLock<Vec<Region>> = OnceLock::new();
    REGIONS.get_or_init(|| {
        let islands: Vec<Island> =
            serde_json::from_str(include_str!("../../../content/world/regions.json")).unwrap_or_default();
        let regions = islands.into_iter().flat_map(|Island { island, regions }| {
            regions.into_iter().map(move |region| Region { island: island.clone(), ..region })
        });
        regions.collect()
    })
}

/// The region the node `id` lies in, where the regions name it.
#[must_use]
pub fn of_node(id: &str) -> Option<&'static Region> {
    all().iter().find(|region| region.nodes.iter().any(|node| node == id))
}

/// The region a point at sea lies off: the one whose centre is nearest, as the held map judges a point.
#[must_use]
pub fn off(at: [f64; 2]) -> Option<&'static Region> {
    let apart = |region: &Region| {
        let [east, south] = [region.centre[0] - at[0], region.centre[1] - at[1]];
        east * east + south * south
    };
    all().iter().min_by(|one, other| apart(one).total_cmp(&apart(other)))
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_gullwing_vale_lies_in_the_weirlands_and_overlooks_harbour_lies_off_the_beacon_shore() {
        let weirlands = super::of_node("gullwing-vale").unwrap();
        assert_eq!((weirlands.name.as_str(), weirlands.island.as_str()), ("The Weirlands", "continent-1"));
        assert_eq!(super::off(weirlands.anchorage).map(|region| region.name.as_str()), Some("The Weirlands"));
        // Overlook, the city of the Beacon Shore, stands at (2809214, 1201477).
        assert_eq!(super::off([2_809_214.0, 1_201_477.0]).map(|region| region.name.as_str()), Some("The Beacon Shore"));
        assert!(super::of_node("nowhere").is_none());
    }
}
