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
    assert!(crates >= 1, "a Miniboss's piece holds an Ammo crate, kept while there is room");
    let far = flotsam.tick(2, &[(1, [5_000.0, 2_000.0])], &mut characters);
    assert!(far.is_empty());
}

#[test]
fn a_harder_seas_pieces_hold_a_vestige_as_often_as_a_harder_voyage_pays_one_on_land() {
    use gear::Difficulty;
    for rank in Rank::ALL {
        let plain = vestige_chance(rank, Difficulty::Normal);
        assert_eq!(plain, gear::rewards::worth(foe_of(rank)).vestige, "{rank:?} at Normal: its foe's own chance");
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

#[test]
fn a_vestige_in_flotsam_gathered_with_the_carried_ten_full_goes_to_the_mail() {
    let mut flotsam = Flotsam::new(1);
    flotsam.lay(&sank(Rank::Boss, vec![1]), 0, (1, 0));
    let mut full = Character::starting();
    for _ in 0..gear::character::VESTIGES_MOST {
        assert!(full.pick_up(Vestige::new(0, gear::Rarity::Normal, gear::Slot::Legs, 1)));
    }
    let mut characters = BTreeMap::from([(1, full)]);
    let mut gathered = Vec::new();
    for clock in 1..=8 {
        let at = flotsam.for_player(1).next().map_or([0.0, 0.0], |piece| piece.at);
        gathered.extend(flotsam.tick(clock, &[(1, at)], &mut characters));
    }
    assert!(gathered.iter().all(|(_, _, held)| held.vestige.is_none()), "none carried");
    assert_eq!(characters[&1].vestiges_held(false), gear::character::VESTIGES_MOST);
    let posted = characters[&1].mail.iter().filter(|letter| letter.vestige.is_some()).count();
    assert!(posted >= 1, "a Boss's chest holds a Vestige, and it went to the mail");
}
