//! A patrol area's gates toward the other patrol areas of its island
//! ([[Each Island Has Three Regions, and Saltmere's Three Patrol Zones Stay, Linked]]): passages across the island,
//! each on the zone's landing toward the zone it leads to, added once the zone is planned, so its places, ways and
//! runs stand as they would alone. Its map joins each to the landing by a way, and its sites mark each as a gate.

use crate::Link;
use crate::areas::Area;
use crate::basins::Basin;
use crate::brief::AreaKind;
use crate::field::distance;
use crate::paths::{Path, Tier};
use crate::sites::{Site, SiteKind};

/// How far out on its landing a crossing gate stands, as a share of the landing's reach, and its own reach, metres.
const CROSSING_OUT: f64 = 0.7;
const CROSSING_M: f64 = 10.0;

/// Whether an area is a crossing gate: a passage across the island, standing no arch and no palisade of its own.
#[must_use]
pub fn is_crossing(area: &Area) -> bool {
    area.kind == AreaKind::Gate && (area.radius - CROSSING_M).abs() < 1e-9
}

/// Each crossing gate: on the landing (the first area), toward the patrol area it leads to. None without a landing.
fn gates(areas: &[Area], links: &[Link]) -> Vec<Area> {
    let Some(landing) = areas.first().filter(|area| area.kind == AreaKind::Landing) else { return Vec::new() };
    links
        .iter()
        .filter(|link| link.patrol)
        .map(|link| {
            let out = landing.radius * CROSSING_OUT / distance(landing.at, link.towards).max(1e-9);
            let at = [
                landing.at[0] + (link.towards[0] - landing.at[0]) * out,
                landing.at[1] + (link.towards[1] - landing.at[1]) * out,
            ];
            Area { kind: AreaKind::Gate, name: String::new(), at, radius: CROSSING_M, leads_to: Some(link.id.clone()) }
        })
        .collect()
}

/// Adds the crossing gates to a planned layout's areas (each with an empty basin), its sites, and the ways its map
/// joins, each from the landing.
pub fn add(
    links: &[Link],
    (areas, basins): (&mut Vec<Area>, &mut Vec<Basin>),
    (sites, ways): (&mut Vec<Site>, &mut Vec<(Path, [usize; 2])>),
) {
    for gate in gates(areas, links) {
        let (at, radius, holds) = (gate.at, gate.radius, gate.leads_to.clone());
        sites.push(Site { kind: SiteKind::Gate, at, radius, holds, node: None, facing: None });
        let way =
            Path { tier: Tier::Footpath, points: vec![areas[0].at, at], crossings: Vec::new(), heights: Vec::new() };
        ways.push((way, [0, areas.len()]));
        basins.push(Basin { floors: Vec::new(), terraces: Vec::new() });
        areas.push(gate);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_crossing_gate_stands_on_the_landing_toward_its_zone_apart_from_the_other_and_joined_to_the_landing() {
        let landing = Area {
            kind: AreaKind::Landing,
            name: "Shingle Landing".into(),
            at: [0.0, 0.0],
            radius: 48.0,
            leads_to: None,
        };
        let mill = Link { id: "mill".into(), towards: [0.0, 500.0], patrol: false };
        // Saltmere's two other zones as the Downs sees them, 48 degrees apart.
        let vale = Link { id: "vale".into(), towards: [-475_000.0, 608_000.0], patrol: true };
        let moors = Link { id: "moors".into(), towards: [-461_000.0, 37_000.0], patrol: true };
        let (mut areas, mut basins) = (vec![landing], vec![Basin { floors: Vec::new(), terraces: Vec::new() }]);
        let (mut sites, mut ways) = (Vec::new(), Vec::new());
        add(&[mill, vale, moors], (&mut areas, &mut basins), (&mut sites, &mut ways));
        assert_eq!(areas.iter().filter_map(|area| area.leads_to.as_deref()).collect::<Vec<_>>(), ["vale", "moors"]);
        let [_, vale, moors] = [&areas[0], &areas[1], &areas[2]];
        assert!(distance(vale.at, [0.0, 0.0]) + vale.radius <= 48.0, "on the landing");
        assert!(distance(vale.at, moors.at) > vale.radius + moors.radius, "apart: {:?} {:?}", vale.at, moors.at);
        assert!(vale.at[0] < 0.0 && vale.at[1] > 0.0, "toward the Vale");
        assert_eq!(basins.len(), areas.len());
        assert_eq!(sites.iter().filter(|site| site.kind == SiteKind::Gate).count(), 2);
        assert_eq!(ways.iter().map(|(_, joined)| *joined).collect::<Vec<_>>(), [[0, 1], [0, 2]]);
        let patrols: Vec<Link> =
            [vale, moors].map(|area| Link { id: area.name.clone(), towards: area.at, patrol: true }).into();
        let none = gates(&[Area { kind: AreaKind::Hamlet, ..areas[0].clone() }], &patrols);
        assert!(none.is_empty(), "no landing, no crossing");
    }
}
