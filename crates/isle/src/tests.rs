use crate::catalog::{Role, catalog};
use crate::sites::ANCHORAGE_OFF_M;
use crate::{Kind, Plan, reach_of};
use movement::Terrain;

const CLIMATES: [&str; 8] = ["woodland", "highland", "desert", "savanna", "steppe", "rainforest", "swamp", "tundra"];

fn plan(seed: u64, climate: &str) -> Plan {
    Plan::new(seed, climate).unwrap_or_else(|| panic!("{climate} dresses no island"))
}

/// The first seed from `from` that makes an island of the kind.
fn seed_of(kind: Kind, from: u64) -> u64 {
    (from..).find(|&seed| Kind::of(seed) == kind).unwrap_or(from)
}

/// A fingerprint of everything an island is built as: its ground's heights, its modules and its blocks (FNV-1a over
/// their bits).
fn fingerprint(plan: &Plan) -> u64 {
    let mut numbers = plan.ground.to_floats();
    for placement in &plan.placements {
        numbers.extend([f64::from(placement.module), placement.turn, placement.scale, placement.lift]);
        numbers.extend(placement.at);
    }
    for block in &plan.blocks {
        numbers.extend([block.min_x, block.min_y, block.max_x, block.max_y, block.top]);
    }
    numbers
        .iter()
        .flat_map(|number| number.to_bits().to_le_bytes())
        .fold(0xcbf2_9ce4_8422_2325, |hash, byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3))
}

#[test]
fn a_seed_builds_the_same_island_every_time() {
    for climate in CLIMATES {
        for seed in [1, seed_of(Kind::Ruin, 2), seed_of(Kind::Quarry, 3)] {
            assert_eq!(fingerprint(&plan(seed, climate)), fingerprint(&plan(seed, climate)), "{seed} in {climate}");
        }
    }
}

#[test]
fn an_island_is_the_same_bits_on_every_machine() {
    // Pinned once: a change to how islands are made changes these, and every machine must take the new ones together.
    let pinned = [(41, "desert"), (seed_of(Kind::Ruin, 50), "tundra"), (seed_of(Kind::Quarry, 60), "rainforest")];
    let found: Vec<u64> = pinned.iter().map(|&(seed, climate)| fingerprint(&plan(seed, climate))).collect();
    assert_eq!(found, GOLDEN, "the islands' bits moved: {found:?}");
}

/// The ground's own fingerprint for the first pinned island, which server/isle.test.ts pins too: the page's
/// WebAssembly must build the same ground as the room.
#[test]
fn the_grounds_bits_are_the_ones_the_page_pins() {
    let ground = plan(41, "desert").ground.to_floats();
    let hash = ground
        .iter()
        .flat_map(|number| number.to_bits().to_le_bytes())
        .fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3));
    assert_eq!(format!("{hash:016x}"), GROUND_41_DESERT);
}

const GROUND_41_DESERT: &str = "5372bca559dd7c59";

const GOLDEN: [u64; 3] = [11_144_284_493_814_852_190, 2_909_213_143_875_111_928, 13_246_981_835_577_183_042];

#[test]
fn seeds_and_climates_make_different_islands() {
    let mut seen = std::collections::BTreeSet::new();
    for seed in 0..12 {
        for climate in ["woodland", "desert", "tundra"] {
            assert!(seen.insert(fingerprint(&plan(seed, climate))), "{seed} in {climate} repeats another");
        }
    }
}

#[test]
fn about_one_island_in_eight_is_an_isle_half_ruins_and_half_quarries() {
    let kinds: Vec<Kind> = (0..8_000).map(Kind::of).collect();
    let count = |kind| kinds.iter().filter(|&&found| found == kind).count();
    let isles = count(Kind::Ruin) + count(Kind::Quarry);
    assert!((850..1_150).contains(&isles), "{isles} isles in 8000");
    assert!(count(Kind::Ruin).abs_diff(count(Kind::Quarry)) < 150);
}

#[test]
fn coves_are_about_150_m_across_and_isles_300_to_500() {
    for seed in 0..300 {
        let across = 2.0 * reach_of(seed);
        if Kind::of(seed).is_isle() {
            assert!((300.0..=500.0).contains(&across), "isle {seed} is {across} m across");
        } else {
            assert!((130.0..=180.0).contains(&across), "cove {seed} is {across} m across");
        }
    }
}

#[test]
fn an_unknown_climate_makes_no_island_and_the_lantern_seas_open_sea_dresses_its_as_woodland() {
    assert!(Plan::new(1, "moon").is_none());
    let dressing = |climate: &str| format!("{:?}", catalog().climates[climate]);
    assert_eq!(dressing("temperate-coast"), dressing("woodland"), "past home's reach, islands as woodland's");
}

#[test]
fn a_player_lands_on_the_beach_from_an_anchorage_in_open_water() {
    for climate in CLIMATES {
        for seed in 0..20 {
            let plan = plan(seed, climate);
            let shape = &plan.shape;
            let anchorage = plan.sites.anchorage;
            let off = (anchorage[0] * anchorage[0] + anchorage[1] * anchorage[1]).sqrt();
            assert!((off - shape.edge(shape.landing) - ANCHORAGE_OFF_M).abs() < 1e-6);
            let cliffs = catalog().climates[climate].cliffs;
            assert!(shape.height(anchorage, cliffs) < -2.0, "{seed} {climate}: the anchorage is shallow");
            assert_eq!(crate::shape_of(seed).anchorage(), anchorage, "the sea anchors where the island says");
            for spawn in &plan.sites.spawns {
                let ground = plan.ground.height_at(spawn[0], spawn[1]);
                assert!((0.5..3.0).contains(&ground), "{seed} {climate}: a spawn {ground} m up");
                assert!(reach::inside(&plan.ring, spawn[0], spawn[1]), "{seed} {climate}: a spawn outside the section");
            }
        }
    }
}

#[test]
fn every_island_has_its_kinds_door_on_its_land() {
    for climate in CLIMATES {
        for seed in [0, 1, seed_of(Kind::Ruin, 5), seed_of(Kind::Quarry, 9)] {
            let plan = plan(seed, climate);
            let door = plan.sites.door;
            assert_eq!(door.style, plan.kind.dungeon());
            assert!(plan.ground.height_at(door.at[0], door.at[1]) > 0.5, "{seed} {climate}: the door is in the sea");
            let name = format!("common.door.{}", door.style);
            let module = catalog().number(&name);
            assert_eq!(plan.placements.iter().filter(|placement| Some(placement.module) == module).count(), 1);
        }
    }
    assert_eq!(Kind::ALL.map(Kind::dungeon), ["caverns", "crypt", "mines"]);
}

#[test]
fn isles_have_a_landmark_and_guards_and_coves_have_neither() {
    for seed in [seed_of(Kind::Cove, 0), seed_of(Kind::Ruin, 0), seed_of(Kind::Quarry, 0)] {
        let plan = plan(seed, "woodland");
        let landmarks =
            plan.placements.iter().filter(|placement| catalog().module(placement.module).role == Role::Landmark);
        if plan.kind.is_isle() {
            assert_eq!(landmarks.count(), 1);
            assert_eq!(plan.sites.guards.len(), 3, "{seed}: a post for each group");
            assert!(plan.sites.camp.is_some());
        } else {
            assert_eq!(landmarks.count(), 0);
            assert!(plan.sites.guards.is_empty() && plan.sites.camp.is_none());
        }
    }
}

#[test]
fn wrecks_lie_on_the_strand_each_with_its_hull() {
    for climate in CLIMATES {
        for seed in 0..12 {
            let plan = plan(seed, climate);
            let wanted = if plan.kind.is_isle() { 3..=5 } else { 2..=3 };
            assert!(wanted.contains(&plan.sites.wrecks.len()), "{seed} {climate}: {} wrecks", plan.sites.wrecks.len());
            for wreck in &plan.sites.wrecks {
                let ground = plan.ground.height_at(wreck.at[0], wreck.at[1]);
                assert!((0.0..2.5).contains(&ground), "{seed} {climate}: a wreck {ground} m up");
                let hull = plan.placements.iter().any(|placement| {
                    catalog().module(placement.module).role == Role::Wreck
                        && (placement.at[0] - wreck.at[0]).abs() < 1e-9
                        && (placement.at[1] - wreck.at[1]).abs() < 1e-9
                });
                assert!(hull, "{seed} {climate}: a wreck with no hull");
            }
        }
    }
}

#[test]
fn every_island_carries_two_to_four_resource_nodes_inland_apart_and_clear_of_its_places() {
    let far = |one: [f64; 2], other: [f64; 2]| libm::hypot(one[0] - other[0], one[1] - other[1]);
    for climate in CLIMATES {
        for seed in 0..12 {
            let plan = plan(seed, climate);
            let nodes = &plan.sites.nodes;
            assert!((2..=4).contains(&nodes.len()), "{seed} {climate}: {} nodes", nodes.len());
            let sites = &plan.sites;
            let (landmark, camp) = (sites.landmark.map(|(at, _)| at), sites.camp);
            let kept: Vec<[f64; 2]> =
                sites.spawns.iter().copied().chain([sites.door.at]).chain(landmark).chain(camp).collect();
            for (number, &node) in nodes.iter().enumerate() {
                assert!(plan.ground.height_at(node[0], node[1]) > 0.0, "{seed} {climate}: a node in the water");
                assert!(kept.iter().all(|&place| far(place, node) > 15.0), "{seed} {climate}: a node on a place");
                assert!(
                    plan.sites.wrecks.iter().all(|wreck| far(wreck.at, node) > 15.0),
                    "{seed} {climate}: by a wreck"
                );
                assert!(nodes[..number].iter().all(|&other| far(other, node) > 20.0), "{seed} {climate}: two together");
                // Gathered where it stands: no module's solid over it or within a metre.
                let blocked = plan.blocks.iter().find(|block| {
                    node[0] > block.min_x - 1.0
                        && node[0] < block.max_x + 1.0
                        && node[1] > block.min_y - 1.0
                        && node[1] < block.max_y + 1.0
                });
                assert!(blocked.is_none(), "{seed} {climate}: a node at {node:?} under {blocked:?}");
                if let Some(quarry) = &plan.shape.quarry {
                    assert!(far(quarry.at, node) > quarry.radius, "{seed} {climate}: a node in the quarry's pit");
                }
            }
        }
    }
}

/// How far round its middle a placed module reaches, as the dressing measures it.
fn reach_of_placed(placement: &crate::Placement) -> f64 {
    let [across, along, _] = catalog().module(placement.module).size;
    across.max(along) * 0.5 * placement.scale
}

#[test]
fn no_module_stands_on_a_place_kept_clear_or_on_the_door_landmark_wrecks_and_camp() {
    let set = |role: Role| matches!(role, Role::Door | Role::Landmark | Role::Wreck | Role::WreckBit | Role::Camp);
    for climate in CLIMATES {
        for seed in [0, 1, 2, seed_of(Kind::Ruin, 3), seed_of(Kind::Quarry, 4), seed_of(Kind::Quarry, 400)] {
            let plan = plan(seed, climate);
            let clear = plan.sites.clear(&plan.shape);
            let (fixed, laid): (Vec<&crate::Placement>, Vec<&crate::Placement>) =
                plan.placements.iter().partition(|placement| set(catalog().module(placement.module).role));
            for placement in laid {
                let (role, reach) = (catalog().module(placement.module).role, reach_of_placed(placement));
                let apart = |point: [f64; 2]| libm::hypot(placement.at[0] - point[0], placement.at[1] - point[1]);
                for &(point, radius) in &clear {
                    assert!(apart(point) >= radius + reach - 1e-9, "{seed} {climate}: a {role:?} on a clear place");
                }
                for other in &fixed {
                    let between = apart([other.at[0], other.at[1]]);
                    assert!(
                        between >= (reach + reach_of_placed(other)) * 0.5 - 1e-9,
                        "{seed} {climate}: a {role:?} on a {:?}",
                        catalog().module(other.module).role
                    );
                }
            }
        }
    }
}

#[test]
fn an_isles_camp_stands_clear_of_its_quarry_and_each_group_has_its_post() {
    for seed in (0..4000).filter(|&seed| Kind::of(seed) == Kind::Quarry).take(40) {
        let plan = plan(seed, "steppe");
        let (quarry, camp) = (plan.shape.quarry.as_ref().expect("a quarry"), plan.sites.camp.expect("a camp"));
        let off = libm::hypot(camp[0] - quarry.at[0], camp[1] - quarry.at[1]);
        assert!(off >= quarry.radius + 13.0 - 1e-9, "{seed}: the camp {off} m from a {} m pit", quarry.radius);
        assert_eq!(plan.sites.guards, vec![plan.sites.guards[0], plan.sites.door.at, camp], "{seed}");
    }
}

#[test]
fn each_climate_dresses_from_its_own_kit() {
    for climate in CLIMATES {
        let plan = plan(3, climate);
        let kit = &catalog().climates[climate].kit;
        let trees = plan.placements.iter().filter(|placement| catalog().module(placement.module).role == Role::Tree);
        let names: Vec<&str> = trees.map(|placement| catalog().names[usize::from(placement.module)].as_str()).collect();
        assert!(!names.is_empty(), "{climate} grows no tree");
        assert!(names.iter().all(|name| name.starts_with(&format!("{kit}."))), "{climate}: {names:?}");
    }
}

#[test]
fn every_solid_stands_as_a_block() {
    let plan = plan(seed_of(Kind::Ruin, 0), "steppe");
    let solids: usize = plan.placements.iter().map(|placement| catalog().module(placement.module).solids.len()).sum();
    assert_eq!(plan.blocks.len(), solids);
    assert!(plan.blocks.iter().all(|block| block.min_x < block.max_x && block.min_y < block.max_y));
}

#[test]
fn the_contract_gives_every_biome_kit_the_same_pieces_and_every_climate_its_trees() {
    let catalog = catalog();
    let pieces = |kit: &str| -> Vec<String> {
        let prefix = format!("{kit}.");
        catalog.names.iter().filter_map(|name| name.strip_prefix(&prefix)).map(str::to_owned).collect()
    };
    let first = pieces("temperate");
    for kit in ["arid", "tropical", "frozen"] {
        assert_eq!(pieces(kit), first, "{kit}");
    }
    for (climate, dressing) in &catalog.climates {
        assert!(catalog.kits.contains(&dressing.kit), "{climate}");
        assert!(dressing.tree.iter().all(|tree| catalog.number(tree).is_some()), "{climate}");
    }
    for (name, module) in catalog.names.iter().zip(&catalog.modules) {
        let [across, along, height] = module.size;
        assert!(across > 0.0 && along > 0.0 && height > 0.0, "{name}");
        assert!(
            module.solids.iter().all(
                |&[x, y, radius]| x.abs() + radius <= across / 2.0 + 1e-9 && y.abs() + radius <= along / 2.0 + 1e-9
            ),
            "{name}: a solid outside it"
        );
    }
}
