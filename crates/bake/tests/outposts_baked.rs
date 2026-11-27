//! Every outpost slot as the bake lays it: its plot level to within 5 cm across its whole square on the
//! baked ground, near its landing, and bare of every piece, path, planting, outcrop and site but its corner stones.

use land::sites::NodeKind;
use layout::Layout;
use layout::areas::PLOT_FROM_LANDING_M;
use layout::field::distance;
use std::path::Path;
use std::sync::OnceLock;

/// How far a plot's ground may stand off its level anywhere on its square, metres.
const LEVEL_WITHIN_M: f64 = 0.05;

struct Site {
    continent: String,
    layout: Layout,
    outpost: Option<bake::OutpostGround>,
    /// How far the plot's ground stands off its level at most on the node's baked window (`bake::plot_off`).
    off: f64,
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
                                let off = outpost.map_or(f64::INFINITY, |outpost| bake::plot_off(&outpost, &window));
                                Site { continent: continent.id.clone(), layout, outpost, off }
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
fn every_outpost_slot_s_plot_is_level_across_its_square_near_its_landing() {
    let sites = sites();
    assert_eq!(sites.len(), 81, "three outpost slots in each of a continent's three regions");
    for site in sites {
        let id = format!("{} {}", site.continent, site.layout.id);
        let outpost = site.outpost.unwrap_or_else(|| panic!("{id}: no plot, muster ground or landing"));
        let off = site.off;
        assert!(off <= LEVEL_WITHIN_M, "{id}: its plot stands {off:.3} m off its level {:.2}", outpost.level);
        let from_landing = distance(outpost.plot, outpost.landing);
        assert!(from_landing <= PLOT_FROM_LANDING_M, "{id}: its plot lies {from_landing:.0} m from its landing");
    }
}

#[test]
fn nothing_stands_on_a_plot_but_its_corner_stones() {
    for site in sites() {
        let found = bake::on_plot(&site.layout);
        assert!(found.is_empty(), "{} {}: {found:#?}", site.continent, site.layout.id);
    }
}
