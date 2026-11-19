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
/// The bearings tried round an area for its cavern.
const BEARINGS: u32 = 16;

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

/// Each coven's and cave's cavern, where one fits: from the first bearing (of sixteen) along which the area's floor (as
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
/// round it with its top at the massif's, and a tunnel mouth where the tunnel opens onto the area's floor.
pub fn build(kit: &mut Kit, cavern: &Cavern, carved: &Sculpts, rise: f64) {
    let turn = turn_along(cavern.way);
    let floor = carved_at(kit, carved, cavern.middle);
    let mut seed = || (kit.draw() * f64::from(u32::MAX)) as u32;
    let (hollow_seed, tunnel_seed, mouth_seed) = (seed(), seed(), seed());
    let top = (floor + rise).max(floor + HOLLOW_UP_M + 6.0);
    let side = 2.0 * (cavern.reach + RESTS_M);
    let roof = [cavern.middle[0], cavern.middle[1], floor + HOLLOW_UP_M];
    kit.solid(
        Solid::upright(Shape::CaveRoof { seed: hollow_seed }, roof, [side, side, top - roof[2]], Material::Rubble)
            .turned(turn),
    );
    let middle = ahead(cavern.mouth, cavern.way, cavern.tunnel / 2.0 + 2.0);
    let tunnel_floor = carved_at(kit, carved, middle);
    let over = [middle[0], middle[1], tunnel_floor + TUNNEL_UP_M];
    let size = [2.0 * (TUNNEL_HALF_M + RESTS_M), cavern.tunnel, top - over[2]];
    kit.solid(Solid::upright(Shape::CaveRoof { seed: tunnel_seed }, over, size, Material::Rubble).turned(turn));
    // The mouth's opening, the middle 0.4 of its span (city's rock.rs), as wide as the tunnel's walked middle.
    let mouth_floor = carved_at(kit, carved, cavern.mouth);
    let size = [2.0 * TUNNEL_HALF_M / 0.4 * 0.6, 6.0, TUNNEL_UP_M + 4.0];
    let at = [cavern.mouth[0], cavern.mouth[1], mouth_floor - 0.5];
    kit.solid(Solid::upright(Shape::TunnelMouth { seed: mouth_seed }, at, size, Material::Rubble).turned(turn));
}
