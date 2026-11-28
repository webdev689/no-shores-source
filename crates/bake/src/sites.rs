//! What a node's layout gives its file: its places, its runs' sealed doors and its crossings to another patrol area,
//! the sites its foes stand at, its chests and the props that hold things, an outpost's ground and a Breach's gate.

use land::ground::Ground;
use serde::{Deserialize, Serialize};

/// Where a layout stood a Breach's gate (`layout::modules`), as its node's room stands it.
pub(crate) fn breach_of(layout: &layout::Layout) -> Option<([f64; 3], u8)> {
    let gate = city::modules::number_of("breach-gate")?;
    let solid = layout
        .seating
        .solids
        .iter()
        .find(|solid| solid.shape == city::solids::Shape::Module { module: gate, group: 0 })?;
    let quarters = (solid.turn / std::f64::consts::FRAC_PI_2).round().rem_euclid(4.0) as u8;
    Some((solid.at, quarters))
}

/// An outpost site's ground: its plot's middle and level (the ground's height on its platform, as the window reads
/// it), and the middles of its muster ground and its landing, metres.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct OutpostGround {
    pub plot: [f64; 2],
    pub level: f64,
    pub muster: [f64; 2],
    pub landing: [f64; 2],
}

/// An outpost site's ground from its layout, its level read on the node's window; None for a layout with no plot,
/// muster ground or landing.
#[must_use]
pub fn outpost_of(layout: &layout::Layout, window: &Ground) -> Option<OutpostGround> {
    use layout::brief::AreaKind;
    let middle = |kind: AreaKind| layout.areas.iter().find(|area| area.kind == kind).map(|area| area.at);
    let (plot, muster, landing) = (middle(AreaKind::Plot)?, middle(AreaKind::Arena)?, middle(AreaKind::Landing)?);
    Some(OutpostGround { plot, level: window.height_at(plot[0], plot[1]), muster, landing })
}

/// How far an outpost site's plot's ground stands off its level at most, read every 2 m across its square on the
/// node's window, metres.
#[must_use]
pub fn plot_off(outpost: &OutpostGround, window: &Ground) -> f64 {
    use layout::areas::PLOT_HALF_M;
    let steps = (-16..=16).flat_map(|row| (-16..=16).map(move |column| (column, row)));
    steps
        .map(|(column, row): (i32, i32)| {
            let x = outpost.plot[0] + PLOT_HALF_M * f64::from(column) / 16.0;
            (window.height_at(x, outpost.plot[1] + PLOT_HALF_M * f64::from(row) / 16.0) - outpost.level).abs()
        })
        .fold(0.0, f64::max)
}

/// What stands on an outpost site's plot but its four corner stones, one line each: a model, a solid, a path, a
/// planting, an outcrop or a site; empty for a bare plot, or a layout with none.
#[must_use]
pub fn on_plot(layout: &layout::Layout) -> Vec<String> {
    use layout::areas::PLOT_HALF_M;
    use layout::field::distance;
    let Some(plot) = layout.areas.iter().find(|area| area.kind == layout::brief::AreaKind::Plot) else {
        return Vec::new();
    };
    let on = |[west, north, east, south]: [f64; 4]| {
        let reach = PLOT_HALF_M;
        west < plot.at[0] + reach
            && east > plot.at[0] - reach
            && north < plot.at[1] + reach
            && south > plot.at[1] - reach
    };
    let point = |at: [f64; 2]| on([at[0], at[1], at[0], at[1]]);
    let mut found: Vec<String> = Vec::new();
    let seating = &layout.seating;
    for seated in seating.buildings.iter().chain(&seating.props).filter(|seated| on(seated.footprint)) {
        found.push(format!("model {} at {:.0},{:.0}", seated.model, seated.at[0], seated.at[1]));
    }
    // A corner stone stands just outside its corner, reaching a little over it.
    let corner = |at: [f64; 3]| {
        let (east, south) = ((at[0] - plot.at[0]).abs(), (at[1] - plot.at[1]).abs());
        (east - PLOT_HALF_M).abs() < 1.0 && (south - PLOT_HALF_M).abs() < 1.0
    };
    let solids = seating.solids.iter().chain(&seating.rooms).filter(|solid| !corner(solid.at));
    for solid in solids.filter(|solid| {
        let [west, north, east, south, ..] = solid.bounds();
        on([west, north, east, south])
    }) {
        found.push(format!("a solid at {:.0},{:.0}", solid.at[0], solid.at[1]));
    }
    let corners = seating.solids.iter().filter(|solid| corner(solid.at)).count();
    if corners != 4 {
        found.push(format!("{corners} corner stones"));
    }
    // Every metre along each way, so no segment crosses the square between its ends.
    let walked = layout.paths.iter().flat_map(|path| path.points.windows(2)).flat_map(|pair| {
        let steps = distance(pair[0], pair[1]).ceil().max(1.0) as usize;
        (0..=steps).map(move |step| {
            let share = step as f64 / steps as f64;
            [pair[0][0] + (pair[1][0] - pair[0][0]) * share, pair[0][1] + (pair[1][1] - pair[0][1]) * share]
        })
    });
    if let Some(at) = walked.into_iter().find(|&at| point(at)) {
        found.push(format!("a path at {:.0},{:.0}", at[0], at[1]));
    }
    for planted in layout.plantings.iter().flat_map(|planting| &planting.points).filter(|&&at| point(at)) {
        found.push(format!("a planting at {:.0},{:.0}", planted[0], planted[1]));
    }
    let reach = PLOT_HALF_M * std::f64::consts::SQRT_2;
    for outcrop in
        layout.sculpt.outcrops.iter().filter(|outcrop| distance(outcrop.at, plot.at) - outcrop.radius < reach)
    {
        found.push(format!("an outcrop at {:.0},{:.0}", outcrop.at[0], outcrop.at[1]));
    }
    for marked in layout.sites.iter().filter(|marked| point(marked.at)) {
        found.push(format!("a {:?} site", marked.kind));
    }
    found
}

/// A place of a node: its name, middle and reach, metres.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Place {
    pub name: String,
    pub at: [f64; 2],
    pub radius: f64,
}

/// How far a run's place reaches round its mouth, metres.
pub const RUN_REACH_M: f64 = 25.0;

/// A layout's foes' sites a room stands groups at, its territories across the zone: every one it lays, a camp's, a
/// ruin's, a keep's, a wreck's, an arena's, a coven's and a cave's area and its runs' beats (the room passes over
/// one by a public event's ground, `stands.rs`).
#[must_use]
pub fn foes_of(layout: &layout::Layout) -> Vec<[f64; 2]> {
    let held = layout.sites.iter().filter(|site| site.kind == layout::sites::SiteKind::Foes);
    held.map(|site| site.at).collect()
}

/// A patrol's chest places, each x, y and the way it faces, in the layout's order.
#[must_use]
pub fn chests_of(layout: &layout::Layout) -> Vec<[f64; 3]> {
    let places = layout.sites.iter().filter(|site| site.kind == layout::sites::SiteKind::Chest);
    places.map(|site| [site.at[0], site.at[1], site.facing.unwrap_or_default()]).collect()
}

/// A patrol's props that hold things, inside its ring: each its box across, its foot, its top and its model.
#[must_use]
pub fn holders_of(layout: &layout::Layout) -> Vec<[f64; 7]> {
    let held = layout.seating.props.iter().filter_map(|prop| {
        let [west, north, east, south] = prop.footprint;
        let inside = layout::field::ring_holds(&layout.ring, (west + east) / 2.0, (north + south) / 2.0);
        inside.then(|| dungeon::models::held_by(prop.model, prop.footprint, prop.at[2])).flatten()
    });
    held.collect()
}

/// A layout's places: its areas, then its runs at their mouths, but a run named as one of its areas is, whose name
/// names that area alone.
#[must_use]
pub fn places_of(layout: &layout::Layout) -> Vec<Place> {
    let areas = layout.areas.iter().map(|area| Place { name: area.name.clone(), at: area.at, radius: area.radius });
    let named = |name: &str| layout.areas.iter().any(|area| area.name == name);
    let runs = layout.runs.iter().filter(|run| !named(&run.name));
    areas.chain(runs.map(|run| Place { name: run.name.clone(), at: run.mouth, radius: RUN_REACH_M })).collect()
}

/// A layout's gates crossing to another patrol area, each named for the node it leads to, at its middle.
#[must_use]
pub fn crossings_of(layout: &layout::Layout) -> Vec<Place> {
    let crossing = layout.areas.iter().filter(|area| area.crosses);
    crossing.filter_map(|area| Some(Place { name: area.leads_to.clone()?, at: area.at, radius: area.radius })).collect()
}

/// A layout's landing zones, each named for the place nearest it and standing where a body lands there.
#[must_use]
pub fn landings_of(layout: &layout::Layout) -> Vec<Place> {
    let named = layout.areas.iter().filter(|area| !area.name.is_empty());
    let nearest = |at: [f64; 2]| {
        let by = |area: &&layout::areas::Area| layout::field::distance(area.at, at);
        named.clone().min_by(|one, other| by(one).total_cmp(&by(other)))
    };
    let landing = |&at: &[f64; 2]| nearest(at).map(|area| Place { name: area.name.clone(), at, radius: 0.0 });
    layout.landings.iter().filter_map(landing).collect()
}

/// A layout's runs' sealed doors, each its run's name and its door's middle, reached from 0 m.
#[must_use]
pub fn doors_of(layout: &layout::Layout) -> Vec<Place> {
    layout.runs.iter().map(|run| Place { name: run.name.clone(), at: run.door, radius: 0.0 }).collect()
}
