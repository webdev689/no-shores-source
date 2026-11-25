//! A cavern under the rock beside a coven's or a cave's floor, where the brief asks for heights: a hollow at the
//! area's level cut into the massif next to its basin, a tunnel into it from the basin, both roofed with rock whose
//! edges rest on the massif round them and whose top stands at the massif's own, and a tunnel mouth where the tunnel
//! opens onto the basin. The map takes the cavern as a roofed space joined to its area by the tunnel.

use crate::areas::Area;
use crate::brief::AreaKind;
use crate::field::{Field, Water};
use crate::pieces::{Kit, turn_along};
use crate::skyline::carved_at;
use city::solids::{Material, Shape, Solid};
use land::sculpts::{CLIFF_RUN_M, Sculpts};
use serde::Serialize;

/// The hollow's reach, the tunnel's shortest and longest, and its half-width, metres.
const HOLLOW_M: f64 = 20.0;
const TUNNELS_M: [f64; 5] = [12.0, 18.0, 24.0, 30.0, 36.0];
const TUNNEL_HALF_M: f64 = 6.0;
/// The headroom under the hollow's roof and the tunnel's, metres.
const HOLLOW_UP_M: f64 = 7.0;
const TUNNEL_UP_M: f64 = 5.0;
/// How far a roof rests on the rock round what it covers, metres.
const RESTS_M: f64 = 5.0;
/// How far inside the claim, and clear of every other floor past its cliff, a cavern lies at the least, metres.
const INSIDE_M: f64 = 40.0;
/// The bearings tried round an area for its cavern: the four quarters, so the chamber, turned a whole quarter at a
/// time (`modules::stand`), faces its tunnel square.
const BEARINGS: u32 = 4;
/// The least a roof stands over its underside, metres, where the rock round it stands lower than its headroom and more.
const ROOF_LEAST_M: f64 = 1.0;

/// A cavern: the area it opens off, where its tunnel leaves the area's floor and the way it runs, its hollow's middle
/// and reach, and its tunnel's length.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Cavern {
    pub area: usize,
    pub mouth: [f64; 2],
    pub way: [f64; 2],
    pub middle: [f64; 2],
    pub reach: f64,
    pub tunnel: f64,
}

impl Cavern {
    /// Its floors for the sculpt: the tunnel, begun a few metres back on the area's floor, and the hollow.
    #[must_use]
    pub fn floors(&self) -> [[f64; 5]; 2] {
        let start = ahead(self.mouth, self.way, -4.0);
        [
            [start[0], start[1], self.middle[0], self.middle[1], TUNNEL_HALF_M],
            [self.middle[0], self.middle[1], self.middle[0], self.middle[1], self.reach],
        ]
    }
}

fn ahead(from: [f64; 2], way: [f64; 2], out: f64) -> [f64; 2] {
    [from[0] + way[0] * out, from[1] + way[1] * out]
}

/// The parts of a sculpt as carved so far: its claim, floors, climbs and raised floors.
type Laid<'a> = (&'a [[f64; 2]], &'a [[f64; 5]], &'a [[f64; 7]], &'a [[f64; 7]]);

/// Each coven's and cave's cavern, where one fits: from the first bearing (of the four quarters) along which the area's floor (as
/// the sculpt carved so far lays it, `laid`, with its massif's height and seed) gives onto rock that holds the tunnel
/// and the hollow well inside the claim, on dry land and clear of every other floor past a cliff's run.
#[must_use]
pub fn find(field: &Field, areas: &[Area], levels: &[f64], laid: Laid, (rise, seed): (f64, u32)) -> Vec<Cavern> {
    let (claim, floors, climbs, raised) = laid;
    let bare = Sculpts::from(vec![land::sculpts::Sculpt {
        claim: claim.to_vec(),
        floors: floors.to_vec(),
        outcrops: Vec::new(),
        rise,
        seed,
        climbs: climbs.to_vec(),
        runs: Vec::new(),
        wings: Vec::new(),
        levels: raised.to_vec(),
        terraced: false,
        roofed: Vec::new(),
    }]);
    let mut found = Vec::new();
    for (number, area) in areas.iter().enumerate() {
        if !matches!(area.kind, AreaKind::Coven | AreaKind::Cave) || levels.get(number).is_none_or(|&level| level > 0.0)
        {
            continue;
        }
        let fits = (0..BEARINGS).find_map(|bearing| {
            let (sine, cosine) = land::exact::sin_cos(std::f64::consts::TAU * f64::from(bearing) / f64::from(BEARINGS));
            let way = [sine, -cosine];
            let mut out = area.radius * 0.5;
            while out < area.radius * 3.0
                && bare.floor_distance(area.at[0] + way[0] * out, area.at[1] + way[1] * out) <= 0.0
            {
                out += 2.0;
            }
            let mouth = ahead(area.at, way, out);
            TUNNELS_M.into_iter().find_map(|tunnel| {
                let middle = ahead(mouth, way, tunnel + HOLLOW_M);
                let clear = (0..=8).all(|step| {
                    let at = ahead(mouth, way, 6.0 + (tunnel + 2.0 * HOLLOW_M) * f64::from(step) / 8.0);
                    let Some((column, row)) = field.cell_of(at[0], at[1]) else { return false };
                    let cell = field.index(column, row);
                    field.claimed[cell] && field.inside[cell] >= INSIDE_M && field.water[cell] == Water::Dry
                });
                let apart = bare.floor_distance(middle[0], middle[1]) >= HOLLOW_M + CLIFF_RUN_M;
                (clear && apart).then_some(Cavern { area: number, mouth, way, middle, reach: HOLLOW_M, tunnel })
            })
        });
        found.extend(fits);
    }
    found
}

/// A cavern's rock, on the land as carved: a roof over its hollow and one over its tunnel, each resting on the rock
/// round it (which stands whole right beside a roofed floor, `land::sculpts::ROOFED_WALL_M`) with its top at the lowest
/// the rock stands round its edges, so no roof stands over the massif; a tunnel mouth where the tunnel opens onto the
/// area's floor, its roof begun where the cliff it opens in stands whole; and the chamber module under the roof.
pub fn build(kit: &mut Kit, cavern: &Cavern, carved: &Sculpts) {
    let turn = turn_along(cavern.way);
    let floor = carved_at(kit, carved, cavern.middle);
    let mut seed = || (kit.draw() * f64::from(u32::MAX)) as u32;
    let (hollow_seed, tunnel_seed, mouth_seed) = (seed(), seed(), seed());
    // The lowest the rock stands round a roof's edges (`along` its middle and `across` either side, each a
    // half-length), where it stands whole: off every floor by more than a wall's run.
    let lowest = |kit: &Kit, middle: [f64; 2], [along, across]: [f64; 2]| {
        let across_way = [-cavern.way[1], cavern.way[0]];
        let at = |a: f64, b: f64| {
            [middle[0] + cavern.way[0] * a + across_way[0] * b, middle[1] + cavern.way[1] * a + across_way[1] * b]
        };
        (0..=8)
            .flat_map(|step| {
                let share = f64::from(step) / 4.0 - 1.0;
                [
                    at(along * share, -across),
                    at(along * share, across),
                    at(-along, across * share),
                    at(along, across * share),
                ]
            })
            .filter(|edge| carved.floor_distance(edge[0], edge[1]) > land::sculpts::ROOFED_WALL_M + 1.0)
            .map(|edge| carved_at(kit, carved, edge))
            .fold(f64::INFINITY, f64::min)
    };
    // Past the floor's edge wherever it wanders, onto the rock round it.
    let side = 2.0 * (cavern.reach * (1.0 + land::sculpts::WANDER) + RESTS_M);
    let roof = [cavern.middle[0], cavern.middle[1], floor + HOLLOW_UP_M];
    let rim = lowest(kit, cavern.middle, [side / 2.0, side / 2.0]);
    let top = roof_top(rim, roof[2]);
    kit.solid(
        Solid::upright(Shape::CaveRoof { seed: hollow_seed }, roof, [side, side, top - roof[2]], Material::Rubble)
            .turned(turn),
    );
    // From where the cliff the tunnel opens in stands whole on to the hollow.
    let from = land::sculpts::ROOFED_WALL_M;
    let middle = ahead(cavern.mouth, cavern.way, from + cavern.tunnel / 2.0);
    let tunnel_floor = carved_at(kit, carved, middle);
    let over = [middle[0], middle[1], tunnel_floor + TUNNEL_UP_M];
    let wide = 2.0 * (TUNNEL_HALF_M * (1.0 + land::sculpts::WANDER) + RESTS_M);
    let rim = lowest(kit, middle, [cavern.tunnel / 2.0, wide / 2.0]);
    let top = roof_top(rim, over[2]);
    let size = [wide, cavern.tunnel, top - over[2]];
    kit.solid(Solid::upright(Shape::CaveRoof { seed: tunnel_seed }, over, size, Material::Rubble).turned(turn));
    // The mouth's opening, the middle 0.4 of its span (city's rock.rs), as wide as the tunnel's walked middle.
    let mouth_floor = carved_at(kit, carved, cavern.mouth);
    let size = [2.0 * TUNNEL_HALF_M / 0.4 * 0.6, 6.0, TUNNEL_UP_M + 4.0];
    let at = [cavern.mouth[0], cavern.mouth[1], mouth_floor - 0.5];
    kit.solid(Solid::upright(Shape::TunnelMouth { seed: mouth_seed }, at, size, Material::Rubble).turned(turn));
    // The chamber under the roof (a handcrafted module), on the lowest of its floor, its entry to the tunnel.
    let low = (0..16)
        .map(|step| {
            let (sine, cosine) = land::exact::sin_cos(std::f64::consts::TAU * f64::from(step) / 16.0);
            carved_at(kit, carved, [cavern.middle[0] + sine * 12.0, cavern.middle[1] + cosine * 12.0])
        })
        .fold(floor, f64::min);
    let back = [-cavern.way[0], -cavern.way[1]];
    crate::modules::stand(kit, "cavern-chamber", [cavern.middle[0], cavern.middle[1], low], ("entry", back));
}

/// A roof's top over its underside: the lowest the rock stands round its edges (`rim`), so no roof stands over the
/// massif, but never thinner than `ROOF_LEAST_M`; 6 m thick where no rock round it stands whole.
fn roof_top(rim: f64, underside: f64) -> f64 {
    if rim.is_finite() { rim.max(underside + ROOF_LEAST_M) } else { underside + 6.0 }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_roof_stands_no_higher_than_the_rock_round_it() {
        assert_eq!(roof_top(30.0, 17.0), 30.0, "rock well over the headroom: the roof's top is the rock's");
        assert_eq!(roof_top(20.0, 17.0), 20.0, "rock 3 m over the underside: no higher");
        assert_eq!(roof_top(17.5, 17.0), 18.0, "rock under the least: the roof its least");
        assert_eq!(roof_top(f64::INFINITY, 17.0), 23.0, "no rock stands whole round it");
    }

    #[test]
    fn a_caverns_tunnel_runs_on_a_quarter_so_its_chamber_faces_it_square() {
        // A coven in the middle of a wide claim, water along three quarters out from it: a slanting tunnel would reach
        // dry rock before the open quarter, east, is tried.
        let (columns, cell) = (100, crate::field::CELL_M);
        let half = columns as f64 * cell / 2.0;
        let count = columns * columns;
        let centre =
            |at: usize| [((at % columns) as f64 + 0.5) * cell - half, ((at / columns) as f64 + 0.5) * cell - half];
        let water: Vec<Water> = (0..count)
            .map(|at| {
                let [x, y] = centre(at);
                let wet = (x * x + y * y).sqrt() > 30.0 && (x.abs() < 12.0 || (y.abs() < 12.0 && x < 0.0));
                if wet { Water::Lake } else { Water::Dry }
            })
            .collect();
        let field = Field {
            seaward: [0.0, -1.0],
            west: -half,
            north: -half,
            columns,
            rows: columns,
            height: vec![5.0; count],
            water,
            slope: vec![0.0; count],
            claimed: vec![true; count],
            to_sea: vec![1e6; count],
            to_fresh: vec![1e6; count],
            inside: vec![1e6; count],
        };
        let claim = vec![[-half, -half], [half, -half], [half, half], [-half, half]];
        let area = Area {
            kind: AreaKind::Coven,
            name: "The Coven".into(),
            at: [0.0, 0.0],
            radius: 30.0,
            leads_to: None,
            crosses: false,
        };
        let floors = [[0.0, 0.0, 0.0, 0.0, 30.0]];
        let found = find(&field, &[area], &[0.0], (&claim, &floors, &[], &[]), (28.0, 3));
        assert_eq!(found.len(), 1, "a cavern is cut");
        for cavern in &found {
            let square = cavern.way[0].abs() > 0.999 || cavern.way[1].abs() > 0.999;
            assert!(square, "the tunnel runs along {:?}", cavern.way);
        }
    }
}
