//! Overlook's lights as continent 1's plan places them: lamps on the avenues' road edges, lanterns on the quay and
//! the piers, the harbour's mouth, every one clear of what stands and of the plaza, and the same on every machine.

use super::{CLEAR_M, LEAST_APART_M, LightKind, ROAD_HIGH, ROAD_LOW, TILE_M, lit, on_road};
use crate::grid::CELL_M;
use crate::hub::tests::planned;
use crate::{Plan, Use};

fn count(plan: &Plan, kind: LightKind) -> usize {
    plan.lights.iter().filter(|light| light.kind == kind).count()
}

#[test]
fn overlook_alone_is_lit_and_never_as_a_ruin() {
    assert!(lit("overlook", false));
    assert!(!lit("overlook", true), "a ruin stays dark");
    assert!(!lit("sunspire", false) && !lit("rimeholt", false), "the other ports are not lit");
}

#[test]
fn overlook_burns_lamps_lanterns_and_its_harbour_mouth() {
    let (_, plan) = planned();
    assert!(count(plan, LightKind::Lamp) > 300, "{} lamps", count(plan, LightKind::Lamp));
    assert!(count(plan, LightKind::Lantern) > 40, "{} lanterns", count(plan, LightKind::Lantern));
    assert_eq!(count(plan, LightKind::Mouth), 2, "a light on each side of the harbour's mouth");
}

#[test]
fn no_light_stands_in_a_solid_on_the_plaza_or_beside_another() {
    let (_, plan) = planned();
    let solids: Vec<_> = plan.landmark.iter().chain(&plan.works).chain(&plan.social.solids).collect();
    let [west, north, east, south] = plan.social.bounds;
    for (number, light) in plan.lights.iter().enumerate() {
        let place = [light.at[0], light.at[1]];
        assert!(!super::blocked(&solids, place, light.at[2]), "{light:?} stands in a solid");
        let on_plaza = place[0] > west - CLEAR_M
            && place[0] < east + CLEAR_M
            && place[1] > north - CLEAR_M
            && place[1] < south + CLEAR_M;
        assert!(!on_plaza, "{light:?} stands on the plaza");
        for other in &plan.lights[number + 1..] {
            let (east, south) = (other.at[0] - light.at[0], other.at[1] - light.at[1]);
            let apart = (east * east + south * south).sqrt();
            assert!(apart >= LEAST_APART_M, "{light:?} and {other:?} stand {apart} m apart");
        }
    }
}

#[test]
fn a_lamp_stands_on_its_avenues_road_at_the_edge() {
    let (_, plan) = planned();
    for light in plan.lights.iter().filter(|light| light.kind == LightKind::Lamp) {
        let column = ((light.at[0] - plan.grid.west) / CELL_M).floor() as usize;
        let row = ((light.at[1] - plan.grid.north) / CELL_M).floor() as usize;
        let cell = plan.cells.iter().find(|cell| (cell.column, cell.row) == (column, row)).expect("a cell under it");
        assert_eq!(cell.used, Use::Avenue, "{light:?} stands on an avenue");
        let paved = |east: isize, south: isize| {
            plan.cells.iter().any(|other| {
                Some(other.column) == column.checked_add_signed(east)
                    && Some(other.row) == row.checked_add_signed(south)
                    && matches!(other.used, Use::Avenue | Use::Landmark)
            })
        };
        let sides = [paved(0, -1), paved(0, 1), paved(-1, 0), paved(1, 0)];
        let across = (light.at[0] - plan.grid.west) / TILE_M - column as f64 * 16.0;
        let down = (light.at[1] - plan.grid.north) / TILE_M - row as f64 * 16.0;
        assert!(on_road(sides, across, down), "{light:?} stands on the road");
        // a metre and a half outward, square to the nearest of the road's edge lines, is off the road
        let to_edge = [ROAD_LOW, ROAD_HIGH]
            .iter()
            .flat_map(|&line| [(line - across, 0.0), (0.0, line - down)])
            .filter(|step| step.0 != 0.0 || step.1 != 0.0)
            .min_by(|a, b| (a.0.abs() + a.1.abs()).total_cmp(&(b.0.abs() + b.1.abs())))
            .expect("four lines");
        let out = 1.5 / TILE_M;
        let beyond = (
            across + to_edge.0.signum() * out * f64::from(u8::from(to_edge.0 != 0.0)),
            down + to_edge.1.signum() * out * f64::from(u8::from(to_edge.1 != 0.0)),
        );
        assert!(!on_road(sides, beyond.0, beyond.1), "{light:?} stands at the road's edge");
    }
}

#[test]
fn every_lantern_stands_on_the_quay_or_a_pier_top() {
    let (_, plan) = planned();
    for light in plan.lights.iter().filter(|light| light.kind != LightKind::Lamp) {
        assert!((light.at[2] - crate::walls::QUAY_TOP_M).abs() < 1e-9, "{light:?} at the quay's top");
        let under = plan.works.iter().any(|solid| {
            let [west, north, east, south, _, top] = solid.bounds();
            (top - crate::walls::QUAY_TOP_M).abs() < 1e-9
                && light.at[0] > west
                && light.at[0] < east
                && light.at[1] > north
                && light.at[1] < south
        });
        assert!(under, "{light:?} stands over the quay or a pier");
    }
}

/// The lights' places to the centimetre, summed with a weight for each axis: the page's test reads the same from the
/// land's WebAssembly (`client/src/city/cityLights.test.ts`), so both builds place them alike.
fn digest(plan: &Plan) -> (usize, i64) {
    let sum = plan.lights.iter().fold(0_i64, |sum, light| {
        let [east, south, up] = light.at.map(|value| (value * 100.0).round() as i64);
        sum + east * 3 + south * 5 + up * 7
    });
    (plan.lights.len(), sum)
}

#[test]
fn overlooks_lights_stand_where_the_page_finds_them() {
    let (_, plan) = planned();
    assert_eq!(digest(plan), (1104, 1_593_904_071_900));
}
