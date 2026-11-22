use super::*;
use crate::clash::tests::at_sea;
use naval::ranks::{Commission, PIRATES};
use std::collections::BTreeMap;

fn sank(rank: Rank, players: Vec<PlayerId>) -> Sank {
    let pirate = crate::pirates::Pirate { level: 12, ..at_sea(4, Commission { faction: PIRATES, rank }, 0.0, true) };
    Sank { pirate, at: [1_000.0, 2_000.0], players, wind: [3.0, 4.0], struck: false }
}

#[test]
fn a_ship_lays_its_ranks_pieces_for_each_player_who_fought_it_within_thirty_metres() {
    for (rank, count) in [(Rank::Minor, 3), (Rank::Major, 4), (Rank::Elite, 5), (Rank::Miniboss, 6), (Rank::Boss, 8)] {
        let mut flotsam = Flotsam::new(1);
        let laid = flotsam.lay(&sank(rank, vec![1, 2]), 0, (1, 0));
        assert_eq!(laid.len(), count * 2, "{rank:?}");
        for player in [1, 2] {
            let theirs: Vec<&Floating> = flotsam.for_player(player).collect();
            assert_eq!(theirs.len(), count);
            assert!(theirs.iter().all(|piece| libm::hypot(piece.at[0] - 1_000.0, piece.at[1] - 2_000.0) <= SPREAD_M));
            let chests = theirs.iter().filter(|piece| piece.kind == Piece::Chest).count();
            assert_eq!(chests, usize::from(rank.number() >= 3), "{rank:?}: one chest from an Elite up");
        }
    }
}

#[test]
fn a_chest_is_rolled_a_rank_up_and_its_hold_lays_twice_over_with_each_chest_another_rank_up() {
    let mut flotsam = Flotsam::new(1);
    flotsam.lay(&sank(Rank::Elite, vec![1]), 0, (2, 1));
    let pieces: Vec<&Floating> = flotsam.for_player(1).collect();
    assert_eq!(pieces.len(), 10);
    for piece in pieces {
        let want = if piece.kind == Piece::Chest { Rank::Boss } else { Rank::Elite };
        assert_eq!(piece.rank, want);
    }
}

#[test]
fn a_ship_drops_as_one_foe_of_its_rank_for_each_player_and_its_hold_as_one_a_rank_higher() {
    for rank in Rank::ALL {
        let mut flotsam = Flotsam::new(1);
        flotsam.lay(&sank(rank, vec![1, 2]), 0, (1, 0));
        flotsam.lay(&sank(rank, vec![1, 2]), 0, (2, 1));
        for player in [1, 2] {
            let drops: Vec<Option<Rank>> =
                flotsam.for_player(player).filter_map(|piece| piece.drop.map(Some)).collect();
            let hold = Rank::numbered(rank.number() + 1).unwrap_or(Rank::Boss);
            assert_eq!(drops, vec![Some(rank), Some(hold)], "{rank:?}: one drop as it sank, one from its hold");
        }
    }
    // Over many sinkings a Miniboss leaves a Vestige about as often as a Miniboss on land: 35 in 100.
    let mut characters = BTreeMap::new();
    let mut vestiges = 0;
    for seed in 0..400 {
        characters.insert(1, Character::starting());
        let mut flotsam = Flotsam::new(seed);
        let sunk = Sank {
            pirate: crate::pirates::Pirate { seed, ..sank(Rank::Miniboss, vec![1]).pirate },
            ..sank(Rank::Miniboss, vec![1])
        };
        flotsam.lay(&sunk, 0, (1, 0));
        let spots: Vec<(PlayerId, [f64; 2])> = flotsam.for_player(1).map(|piece| (1, piece.at)).collect();
        for (clock, spot) in spots.into_iter().enumerate() {
            let gathered = flotsam.tick(clock as u64 + 1, &[spot], &mut characters);
            vestiges += gathered.iter().filter(|(_, _, held)| held.vestige.is_some()).count();
        }
    }
    assert!((100..180).contains(&vestiges), "about 140 Vestiges from 400 Miniboss ships: {vestiges}");
}

#[test]
fn pieces_drift_downwind_and_are_gone_after_three_minutes() {
    let mut flotsam = Flotsam::new(1);
    flotsam.lay(&sank(Rank::Minor, vec![1]), 0, (1, 0));
    let before = flotsam.pieces[0].at;
    let mut characters = BTreeMap::new();
    for clock in 1..=60 {
        flotsam.tick(clock, &[], &mut characters);
    }
    let after = flotsam.pieces[0].at;
    assert!((after[0] - before[0] - 0.18).abs() < 1e-9 && (after[1] - before[1] - 0.24).abs() < 1e-9, "{after:?}");
    flotsam.tick(FLOAT_TICKS, &[], &mut characters);
    assert!(flotsam.pieces.is_empty());
}

#[test]
fn a_players_ship_gathers_their_own_pieces_within_twenty_five_metres_and_no_one_elses() {
    let mut flotsam = Flotsam::new(1);
    flotsam.lay(&sank(Rank::Miniboss, vec![1, 2]), 0, (1, 0));
    let mut characters = BTreeMap::from([(1, Character::starting())]);
    let gathered = flotsam.tick(1, &[(1, [1_000.0, 2_000.0])], &mut characters);
    // Every one of a Miniboss's pieces lies within 30 m, so some lie past the ship's 25 m.
    assert!(!gathered.is_empty() && gathered.iter().all(|(_, by, _)| *by == 1));
    assert_eq!(flotsam.for_player(2).count(), 6, "the other player's pieces stay theirs");
    let crates = gathered.iter().filter(|(_, _, held)| held.ammo_crate).count();
    assert!(crates <= 1, "a Miniboss's ship holds one kill's Ammo crate at most: {crates}");
    let far = flotsam.tick(2, &[(1, [5_000.0, 2_000.0])], &mut characters);
    assert!(far.is_empty());
}

#[test]
fn a_harder_seas_ship_leaves_a_vestige_as_often_as_a_harder_voyages_kill_on_land() {
    use gear::Difficulty;
    for rank in Rank::ALL {
        let plain = vestige_chance(rank, Difficulty::Normal);
        assert_eq!(plain, gear::vestige::chance(rank.number()), "{rank:?} at Normal: a foe of its rank's own chance");
        for difficulty in [Difficulty::Elite, Difficulty::Abyss] {
            let raised = (plain * difficulty.reward()).min(1.0);
            assert_eq!(vestige_chance(rank, difficulty), raised, "{rank:?} {difficulty:?}");
        }
    }
}

#[test]
fn every_piece_gathered_holds_ship_materials_for_the_ship_and_what_was_taken_is_its() {
    let mut flotsam = Flotsam::new(1);
    flotsam.lay(&sank(Rank::Boss, vec![1]), 0, (1, 0));
    let mut characters = BTreeMap::from([(1, Character::starting())]);
    let mut gathered = Vec::new();
    for clock in 1..=4 {
        let at = flotsam.for_player(1).next().map_or([0.0, 0.0], |piece| piece.at);
        gathered.extend(flotsam.tick(clock, &[(1, at)], &mut characters));
    }
    let stock = |taken: gear::ship::materials::ShipStock| taken.timber + taken.canvas + taken.iron;
    assert!(!gathered.is_empty() && gathered.iter().all(|(_, _, held)| stock(held.salvage.materials) >= 1));
    let taken: u16 = gathered.iter().map(|(_, _, held)| stock(held.salvage.materials)).sum();
    assert_eq!(stock(characters[&1].materials.ship), taken);
    for module in gathered.iter().filter_map(|(_, _, held)| held.salvage.module) {
        assert!(characters[&1].item(module).is_some_and(|item| item.kind.module()));
    }
}
