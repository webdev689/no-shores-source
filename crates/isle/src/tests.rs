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

const GOLDEN: [u64; 3] = [8_616_181_142_366_350_806, 6_755_526_833_477_609_464, 7_718_992_339_083_215_559];

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
fn the_home_climate_and_an_unknown_one_make_no_island() {
    assert!(Plan::new(1, "temperate-coast").is_none());
    assert!(Plan::new(1, "moon").is_none());
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
            assert!(shape.height(anchorage, 1.0) < -2.0, "{seed} {climate}: the anchorage is shallow");
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
            assert!(plan.sites.guards.len() >= 3, "{seed}: {} guards' posts", plan.sites.guards.len());
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
fn trees_and_rocks_keep_off_the_places_kept_clear() {
    for seed in 0..10 {
        let plan = plan(seed, "rainforest");
        let clear = plan.sites.clear(&plan.shape);
        for placement in &plan.placements {
            let role = catalog().module(placement.module).role;
            if !matches!(role, Role::Tree | Role::Shrub | Role::Grass | Role::Boulder | Role::Outcrop) {
                continue;
            }
            for &(point, radius) in &clear {
                let (along_x, along_y) = (placement.at[0] - point[0], placement.at[1] - point[1]);
                assert!(
                    (along_x * along_x + along_y * along_y).sqrt() >= radius,
                    "{seed}: a {role:?} on a clear place"
                );
            }
        }
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
