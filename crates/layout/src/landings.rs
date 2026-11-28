//! A patrol area's landing zones past its landing, where its brief asks for them: one in the north of its claim and
//! one in the south, each on a way and clear of its places, a beacon fire beside it (`marks::landing_fire`).

use crate::areas::Area;
use crate::field::{Field, distance};
use crate::paths::Path;

/// How far a landing zone keeps off every place's reach, and how far inside the claim it lies, metres.
const PLACE_CLEAR_M: f64 = 30.0;
const INSIDE_M: f64 = 40.0;
/// How far its fire stands off its way's edge, metres.
const FIRE_OFF_M: f64 = 3.5;

/// A landing zone: where a body stands on its way, and where its fire stands beside it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Zone {
    pub at: [f64; 2],
    pub fire: [f64; 2],
}

/// The zones past the landing (at `landing`), north then south of the claim's middle: for each half, of the ways'
/// points on walkable ground well inside the claim and clear of every place, with room for its fire beside its way
/// clear of every way, the one that leaves the half's farthest walkable ground nearest to it or to the landing, so
/// any part of the claim is a short walk from one; none where no point serves.
pub(crate) fn zones(field: &Field, claim: &[[f64; 2]], areas: &[Area], ways: &[Path], landing: [f64; 2]) -> Vec<Zone> {
    let (north, south) = claim
        .iter()
        .fold((f64::INFINITY, f64::NEG_INFINITY), |(north, south), point| (north.min(point[1]), south.max(point[1])));
    let middle = (north + south) / 2.0;
    let open = |at: [f64; 2]| {
        field.cell_of(at[0], at[1]).is_some_and(|(column, row)| {
            let cell = field.index(column, row);
            field.walkable(cell) && field.inside[cell] >= INSIDE_M
        })
    };
    let clear_of_places = |at: [f64; 2]| areas.iter().all(|area| distance(at, area.at) - area.radius >= PLACE_CLEAR_M);
    let fire_beside = |way: &Path, at: usize| {
        let (back, on) = (way.points[at - 1], way.points[at + 1]);
        let length = distance(back, on).max(1e-9);
        let across = [-(on[1] - back[1]) / length, (on[0] - back[0]) / length];
        let off = way.tier.width() / 2.0 + FIRE_OFF_M;
        [1.0, -1.0]
            .into_iter()
            .map(|side| [way.points[at][0] + across[0] * side * off, way.points[at][1] + across[1] * side * off])
            .find(|&fire| {
                let print = [fire[0] - 1.2, fire[1] - 1.2, fire[0] + 1.2, fire[1] + 1.2];
                open(fire) && crate::paths::clear_of(print, ways)
            })
    };
    let candidates: Vec<Zone> = ways
        .iter()
        .flat_map(|way| (1..way.points.len().saturating_sub(1)).map(move |at| (way, at)))
        .filter(|&(way, at)| open(way.points[at]) && clear_of_places(way.points[at]))
        .filter_map(|(way, at)| fire_beside(way, at).map(|fire| Zone { at: way.points[at], fire }))
        .collect();
    // The claim's walkable ground, a cell in every three each way.
    let ground: Vec<[f64; 2]> = (0..field.rows)
        .step_by(3)
        .flat_map(|row| (0..field.columns).step_by(3).map(move |column| (column, row)))
        .filter(|&(column, row)| field.claimed[field.index(column, row)] && field.walkable(field.index(column, row)))
        .map(|(column, row)| field.centre(column, row))
        .collect();
    [true, false]
        .into_iter()
        .filter_map(|northern| {
            let half = |at: [f64; 2]| (at[1] < middle) == northern;
            let farthest = |zone: &Zone| {
                ground
                    .iter()
                    .filter(|at| half(**at))
                    .map(|&at| distance(at, zone.at).min(distance(at, landing)))
                    .fold(0.0, f64::max)
            };
            candidates
                .iter()
                .filter(|zone| half(zone.at))
                .min_by(|one, other| farthest(one).total_cmp(&farthest(other)))
                .copied()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brief::AreaKind;
    use crate::paths::Tier;

    #[test]
    fn a_zone_stands_on_a_way_in_each_half_of_the_claim_clear_of_its_places_its_fire_off_the_way() {
        let field = Field::level(-8.0, -8.0, 77, 115);
        let claim = [[0.0, 0.0], [600.0, 0.0], [600.0, 900.0], [0.0, 900.0]];
        let way = Path {
            tier: Tier::Track,
            points: (0..=90).map(|step| [300.0, f64::from(step) * 10.0]).collect(),
            crossings: Vec::new(),
            heights: Vec::new(),
        };
        // A place in the north half: the zone keeps 30 m past its reach.
        let place = Area {
            kind: AreaKind::Camp,
            name: "Camp".into(),
            at: [300.0, 150.0],
            radius: 40.0,
            leads_to: None,
            crosses: false,
        };
        let zones = zones(&field, &claim, &[place], std::slice::from_ref(&way), [300.0, 450.0]);
        assert_eq!(zones.len(), 2, "{zones:?}");
        let [north, south] = [zones[0], zones[1]];
        assert!(distance(north.at, [300.0, 150.0]) >= 70.0 - 1e-9 && north.at[1] < 300.0, "{north:?}");
        assert!(south.at[1] > 600.0, "toward the far end of its half, away from the landing: {south:?}");
        for zone in zones {
            assert!((zone.at[0] - 300.0).abs() < 1e-9, "on the way");
            assert!(
                ((zone.fire[0] - 300.0).abs() - (Tier::Track.width() / 2.0 + FIRE_OFF_M)).abs() < 1e-9,
                "beside it"
            );
        }
    }
}
