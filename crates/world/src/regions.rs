//! Each island's three regions (`content/world/regions.json`, which the page reads too): a region's centre, the
//! anchorage off its coast and the nodes ashore in it. Leaving a patrol zone puts the ship off its region.
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

/// The region of `island` (a continent's id) a point lies off: the one whose centre is nearest, as the held map judges
/// a point within the island whose waters it lies in.
#[must_use]
pub fn off(island: &str, at: [f64; 2]) -> Option<&'static Region> {
    let apart = |region: &Region| {
        let [east, south] = [region.centre[0] - at[0], region.centre[1] - at[1]];
        east * east + south * south
    };
    let own = all().iter().filter(|region| region.island == island);
    own.min_by(|one, other| apart(one).total_cmp(&apart(other)))
}

/// The region of the patrol zone whose own room `room` is, at any tier (`node-<id>`, `node-<id>--elite`,
/// `node-<id>--abyss`); none for any other room: a dungeon, a run (one started at sea too), a passage, a test copy.
#[must_use]
pub fn zone_left(room: &str) -> Option<&'static Region> {
    let name = room.strip_prefix("node-")?;
    let id = match name.split_once("--") {
        None => name,
        Some((id, "elite" | "abyss")) => id,
        Some(_) => return None,
    };
    patrols().iter().any(|patrol| patrol == id).then(|| of_node(id)).flatten()
}

/// Every island's patrol zones, by id, from its nodes (`content/world/land/<id>.json`).
fn patrols() -> &'static [String] {
    #[derive(Deserialize)]
    struct Land {
        nodes: Vec<Node>,
    }
    #[derive(Deserialize)]
    struct Node {
        id: String,
        kind: String,
    }
    static PATROLS: OnceLock<Vec<String>> = OnceLock::new();
    PATROLS.get_or_init(|| {
        let lands = [
            include_str!("../../../content/world/land/continent-1.json"),
            include_str!("../../../content/world/land/continent-2.json"),
            include_str!("../../../content/world/land/continent-3.json"),
            include_str!("../../../content/world/land/continent-4.json"),
            include_str!("../../../content/world/land/continent-5.json"),
            include_str!("../../../content/world/land/continent-6.json"),
            include_str!("../../../content/world/land/continent-7.json"),
            include_str!("../../../content/world/land/continent-8.json"),
            include_str!("../../../content/world/land/continent-9.json"),
        ];
        let nodes = lands.iter().filter_map(|text| serde_json::from_str::<Land>(text).ok()).flat_map(|land| land.nodes);
        nodes.filter(|node| node.kind == "patrol").map(|node| node.id).collect()
    })
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_gullwing_vale_lies_in_the_weirlands_and_overlooks_harbour_lies_off_the_beacon_shore() {
        let weirlands = super::of_node("gullwing-vale").unwrap();
        assert_eq!((weirlands.name.as_str(), weirlands.island.as_str()), ("The Weirlands", "continent-1"));
        let off = |island, at| super::off(island, at).map(|region| region.name.as_str());
        assert_eq!(off("continent-1", weirlands.anchorage), Some("The Weirlands"));
        // Overlook, the city of the Beacon Shore, stands at (2809214, 1201477).
        assert_eq!(off("continent-1", [2_809_214.0, 1_201_477.0]), Some("The Beacon Shore"));
        assert!(super::of_node("nowhere").is_none());
    }

    #[test]
    fn a_point_lies_off_the_nearest_region_of_its_own_island_though_another_islands_centre_is_nearer() {
        // Off continent-8's coast: the Windward Plateau's centre, on another island, is the nearest of all.
        let off = super::off("continent-8", [4_234_000.0, 1_231_000.0]).map(|region| region.name.as_str());
        assert_eq!(off, Some("The Bell Fens"));
        assert!(super::off("no-island", [0.0, 0.0]).is_none());
    }

    #[test]
    fn every_islands_land_file_parses_and_lists_its_patrol_zones() {
        assert_eq!(super::patrols().len(), 11, "Saltmere's three and one on each other island");
    }

    #[test]
    fn only_a_patrol_zones_own_room_at_any_tier_is_a_zone_left() {
        let left = |room| super::zone_left(room).map(|region| region.name.as_str());
        for room in ["node-gullwing-vale", "node-gullwing-vale--elite", "node-gullwing-vale--abyss"] {
            assert_eq!(left(room), Some("The Weirlands"), "{room}");
        }
        for room in [
            "node-krakens-grotto--sea--run-abcd1234",
            "node-krakens-grotto--elite--playlist-12--run-abcd1234",
            "node-krakens-grotto",
            "node-shrine-tides",
            "node-gullwing-vale--dungeon-0",
            "node-gullwing-vale--elite--dungeon-1--run-abcd1234",
            "node-gullwing-vale--breach-normal--run-abcd1234",
            "node-gullwing-vale--test-abcd1234",
            "node-gullwing-vale--normal",
            "gullwing-vale",
            "sea",
            "node-overlook-social",
        ] {
            assert_eq!(left(room), None, "{room}");
        }
    }
}
