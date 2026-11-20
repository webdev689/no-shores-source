//! The sea room's chart, as its hostile ships read it: its continents' coasts, its nine waters with each island's
//! band of levels, and the friendly lanes, each leg of every route the traffic plans between the port cities.

use crate::sea::{Coast, leg_meets_land, on_land, whole};
use crate::sighting::{Chart, WaterHere};
use world::layout::Layout;
use world::traffic::{Port, Traffic};
use world::waters::{Holder, Waters};

/// The sea's waters, each continent's band, and the lanes' legs, end to end.
#[derive(Debug)]
pub struct Charted {
    waters: Waters,
    bands: Vec<Option<(u8, u8)>>,
    lanes: Vec<[[f64; 2]; 2]>,
}

impl Charted {
    /// The waters of a layout, and the lanes between those of `ports` that are port cities: none with none.
    #[must_use]
    pub fn new(layout: &Layout, ports: &[Port]) -> Self {
        let waters = Waters::new(layout);
        let bands = layout.continents.iter().map(|continent| gear::world::island_levels(&continent.id)).collect();
        let lanes = if ports.is_empty() {
            Vec::new()
        } else {
            let corner = |point: &world::geometry::Point| [point.x as f64, point.y as f64];
            let traffic = Traffic::new(layout, &waters, ports);
            let legs = traffic.routes.iter().flat_map(|route| route.path.windows(2).map(|leg| leg.to_vec()));
            legs.map(|leg| [corner(&leg[0]), corner(&leg[1])]).collect()
        };
        Charted { waters, bands, lanes }
    }

    /// How far a point of sea lies from the nearest coast, metres; 0 on land.
    #[must_use]
    pub fn clearance(&self, at: [f64; 2]) -> f64 {
        self.waters.clearance(at)
    }

    /// The water at a point of sea; none on land.
    #[must_use]
    pub fn water(&self, at: [f64; 2]) -> Option<(world::waters::Water, Option<(u8, u8)>)> {
        let water = self.waters.water_at(at)?;
        Some((water, self.bands.get(water.continent).copied().flatten()))
    }
}

/// The chart a tick reads: the coasts the sea judges courses by, its waters and lanes, and its islands' coasts.
pub(crate) struct SeaChart<'sea> {
    pub coasts: &'sea [Coast],
    pub charted: &'sea Charted,
    pub islands: &'sea [&'sea Coast],
}

impl Chart for SeaChart<'_> {
    fn open(&self, from: [f64; 2], to: [f64; 2]) -> bool {
        // Only a step into home waters is refused: one a fight among captains left inside them sails out.
        let is_home = |at: [f64; 2]| self.water(at).is_some_and(|water| water.holder == Holder::Home);
        let home = is_home(to) && !is_home(from);
        match [whole(&from), whole(&to)] {
            [Some(from), Some(to)] => {
                let islands = self.islands.iter().copied();
                !home
                    && !on_land(self.coasts, to)
                    && !leg_meets_land(self.coasts, from, to)
                    && !on_land(islands.clone(), to)
                    && !leg_meets_land(islands, from, to)
            }
            _ => false,
        }
    }

    fn water(&self, at: [f64; 2]) -> Option<WaterHere> {
        let (water, levels) = self.charted.water(at)?;
        Some(WaterHere { holder: water.holder, levels })
    }

    fn coast(&self, at: [f64; 2]) -> f64 {
        self.charted.waters.clearance(at)
    }

    fn lane(&self, at: [f64; 2]) -> Option<(f64, [f64; 2])> {
        let off = |&[from, to]: &[[f64; 2]; 2]| {
            let (along_x, along_y) = (to[0] - from[0], to[1] - from[1]);
            let length = (along_x * along_x + along_y * along_y).sqrt();
            let way = [along_x / length, along_y / length];
            let ahead = ((at[0] - from[0]) * way[0] + (at[1] - from[1]) * way[1]).clamp(0.0, length);
            let (gap_x, gap_y) = (at[0] - from[0] - ahead * way[0], at[1] - from[1] - ahead * way[1]);
            ((gap_x * gap_x + gap_y * gap_y).sqrt(), way)
        };
        let legs = self.charted.lanes.iter().filter(|[from, to]| from != to).map(off);
        legs.min_by(|one, other| one.0.total_cmp(&other.0))
    }
}

#[cfg(test)]
#[path = "chart_tests.rs"]
mod tests;
