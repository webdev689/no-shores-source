//! Every continent's outpost site as the bake lays it: its plot level to within 5 cm across its whole square on the
//! baked ground, near its landing, and bare of every piece, path, planting, outcrop and site but its corner stones.

use land::sites::NodeKind;
use layout::Layout;
use layout::areas::{PLOT_FROM_LANDING_M, PLOT_HALF_M};
use layout::brief::AreaKind;
use layout::field::distance;
use std::path::Path;
use std::sync::OnceLock;

/// How far a plot's ground may stand off its level anywhere on its square, metres.
const LEVEL_WITHIN_M: f64 = 0.05;

struct Site {
    continent: String,
    layout: Layout,
    outpost: Option<bake::OutpostGround>,
    /// The ground's height every 2 m across the plot's square, read on the node's baked window.
    heights: Vec<f64>,
}

fn sites() -> &'static [Site] {
    static SITES: OnceLock<Vec<Site>> = OnceLock::new();
    SITES.get_or_init(|| {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let read =
            |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
        let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
        let builders = bake::builders(&root).expect("the builders read");
        let blocks = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
        let texts: Vec<String> =
            world.continents.iter().map(|each| read(&format!("content/world/land/{}.json", each.id))).collect();
        std::thread::scope(|scope| {
            let handles: Vec<_> = world
                .continents
                .iter()
                .zip(&texts)
                .map(|(continent, text)| {
                    let (builders, blocks) = (&builders, &blocks);
                    scope.spawn(move || {
                        let edits = land::edits::parse(text).expect("the edits parse");
                        let mut landmass = land::landmass::generate(continent, edits).expect("the land generates");
                        city::settle(&mut landmass, blocks).expect("its city settles");
                        let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
                        let outposts = layouts.into_iter().filter(|layout| layout.kind == NodeKind::Outpost);
                        outposts
                            .map(|layout| {
                                let [west, north, east, south] = bake::bounds_of(&layout.ring);
                                let window = landmass.surface.window(west, north, east, south);
                                let outpost = bake::outpost_of(&layout, &window);
                                let plot = outpost.map_or([0.0, 0.0], |outpost| outpost.plot);
                                let steps = (-16..=16).flat_map(|row| (-16..=16).map(move |column| (column, row)));
                                let heights = steps
                                    .map(|(column, row)| {
                                        let x = plot[0] + PLOT_HALF_M * f64::from(column) / 16.0;
                                        window.height_at(x, plot[1] + PLOT_HALF_M * f64::from(row) / 16.0)
                                    })
                                    .collect();
                                Site { continent: continent.id.clone(), layout, outpost, heights }
                            })
                            .collect::<Vec<_>>()
                    })
                })
                .collect();
            handles.into_iter().flat_map(|handle| handle.join().expect("a continent bakes")).collect()
        })
    })
}

#[test]
fn every_continent_has_one_outpost_site_whose_plot_is_level_across_its_square_near_its_landing() {
    let sites = sites();
    assert_eq!(sites.len(), 9, "one outpost site a continent");
    for site in sites {
        let id = format!("{} {}", site.continent, site.layout.id);
        let outpost = site.outpost.unwrap_or_else(|| panic!("{id}: no plot, muster ground or landing"));
        let off = site.heights.iter().map(|height| (height - outpost.level).abs()).fold(0.0, f64::max);
        assert!(off <= LEVEL_WITHIN_M, "{id}: its plot stands {off:.3} m off its level {:.2}", outpost.level);
        let from_landing = distance(outpost.plot, outpost.landing);
        assert!(from_landing <= PLOT_FROM_LANDING_M, "{id}: its plot lies {from_landing:.0} m from its landing");
        assert!(distance(outpost.plot, outpost.muster) > PLOT_HALF_M * 2.0, "{id}: its muster ground is apart");
    }
}

#[test]
fn nothing_stands_on_a_plot_but_its_corner_stones() {
    for site in sites() {
        let layout = &site.layout;
        let Some(plot) = layout.areas.iter().find(|area| area.kind == AreaKind::Plot) else { continue };
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
        for path in &layout.paths {
            if let Some(at) = path.points.iter().find(|&&at| point(at)) {
                found.push(format!("a path at {:.0},{:.0}", at[0], at[1]));
            }
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
        assert!(found.is_empty(), "{} {}: {found:#?}", site.continent, layout.id);
    }
}
