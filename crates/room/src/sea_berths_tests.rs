//! A port city's berths as the sea judges a course to them: from the roadstead a ship puts in at, to each place its
//! pier moors a ship at (`city::hub::harbour`), on the world's own layout and coasts.

use super::*;

fn read(path: &str) -> String {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository")
}

/// Each place a continent's city moors a ship beside its pier, as its plan lays them on its settled ground: none for a
/// city that reaches no pier.
fn moorings_of(continent: &world::layout::Continent) -> Vec<[f64; 3]> {
    let edits = land::edits::parse(&read(&format!("content/world/land/{}.json", continent.id))).expect("the edits");
    let blocks = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index");
    let mut landmass = land::landmass::generate(continent, edits).expect("the continent generates");
    city::settle(&mut landmass, &blocks).expect("its city settles").map_or_else(Vec::new, |plan| plan.social.moorings)
}

#[test]
fn a_ship_at_a_port_citys_roadstead_may_sail_to_every_place_at_its_pier() {
    let (layout, ports) = crate::measure_tests::world();
    let mut sea = Sea::new(&layout, crate::deck::test_deck(), 7, &ports);
    let mut judged = 0;
    for port in ports.iter().filter(|port| world::ports::is_main_port(&port.id)) {
        let continent = layout.continents.iter().find(|continent| continent.id == port.continent).expect("its land");
        let roadstead = sea.harbour.harbours.ports.iter().find(|(id, _)| *id == port.id).expect("its roadstead").1;
        for [x, y, _] in moorings_of(continent) {
            let player = sea.join();
            assert_eq!(sea.course(player, &[roadstead, [x, y]], 10), Ok(()), "{} to its pier at {x}, {y}", port.id);
            judged += 1;
        }
    }
    assert!(judged > 0, "a port city moors ships at its pier");
}
