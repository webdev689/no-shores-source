//! The economy's pace, after Destiny 1 at launch: what each piece costs to finish against its rarity's, what a week's
//! Essence and Shapes buy, how reputation's ranks fall against a player's level, and the whole ledger of pay and costs,
//! printed by hand: `cargo test -p gear --release measure_the_economy -- --ignored --nocapture`.

use crate::activities::Weekly;
use crate::bounties::bounty_pay;
use crate::chests::{CHEST_AUREM, CHEST_XP, FIRST_HEROIC_ESSENCE};
use crate::clears::ABYSS_SHAPES;
use crate::factions::factions;
use crate::grid::{BREACH_LAST_ESSENCE, Cost};
use crate::item::{Item, NAMED_LEVEL};
use crate::kinds::Kind;
use crate::playlist::Playlist;
use crate::power::xp_for_level;
use crate::rarity::Rarity;
use crate::rewards::{Clear, Foe, at_level, worth};
use crate::ship::SINKING_KILLS;
use crate::vestige::{chance, colours};

/// An item of a kind and rarity at level 20, as a Vestige or a vendor makes it, its nodes all to buy.
fn item(kind: Kind, rarity: Rarity) -> Item {
    Item::new(0, kind, rarity, NAMED_LEVEL, kind.slot())
}

/// What every node of an item costs together, and with one node a column (what a player needs to finish it).
fn finishing(item: &Item) -> (Cost, Cost) {
    let add = |sum: Cost, cost: Cost, times: u16| Cost {
        aurem: sum.aurem + cost.aurem * u32::from(times),
        fragments: sum.fragments + cost.fragments * times,
        essence: sum.essence + cost.essence * times,
        resource: sum.resource + cost.resource * times,
    };
    item.columns().iter().enumerate().fold((Cost::default(), Cost::default()), |(every, one), (at, column)| {
        let cost = item.cost_of(at);
        (add(every, cost, u16::from(column.nodes())), add(one, cost, 1))
    })
}

/// Its Prestige with every upgrade bought.
fn upgraded_prestige(mut item: Item) -> u32 {
    for column in 0..item.columns().len() {
        if let Some(bit) = item.node_bit(column, 0).filter(|_| item.columns()[column] == crate::grid::Column::Upgrade) {
            item.bought |= bit;
        }
    }
    item.prestige()
}

#[test]
fn an_atheric_never_costs_less_of_anything_to_finish_than_a_legendary_and_more_aurem_and_essence() {
    for kind in [Kind::Sword, Kind::Bow, Kind::Head, Kind::Guns, Kind::Hull] {
        let (legendary, atheric) = (finishing(&item(kind, Rarity::Legendary)), finishing(&item(kind, Rarity::Atheric)));
        for (legendary, atheric, how) in [(legendary.0, atheric.0, "every node"), (legendary.1, atheric.1, "a column")]
        {
            assert!(atheric.aurem > legendary.aurem && atheric.essence > legendary.essence, "{kind:?}, {how}");
            assert!(atheric.fragments >= legendary.fragments && atheric.resource >= legendary.resource, "{kind:?}");
        }
    }
    // Destiny 1's last three nodes: a legendary 6 Ascendant materials each, an exotic 8.
    assert_eq!(finishing(&item(Kind::Torso, Rarity::Legendary)).0.essence, 18);
    assert_eq!(finishing(&item(Kind::Torso, Rarity::Atheric)).0.essence, 8 * 3 + 1);
}

#[test]
fn a_breachs_legendary_armour_asks_seven_essence_a_last_upgrade_and_climbs_to_thirty() {
    let mut breach = item(Kind::Legs, Rarity::Legendary);
    breach.breach = true;
    assert_eq!(
        finishing(&breach).0.essence,
        3 * BREACH_LAST_ESSENCE,
        "between a Legendary's six and an Atheric's eight"
    );
    assert_eq!(upgraded_prestige(breach), 30);
}

#[test]
fn every_piece_carries_its_raritys_prestige_whatever_its_grid_holds() {
    for kind in [Kind::Head, Kind::Torso, Kind::Guns, Kind::Hull, Kind::Sails, Kind::Rigging] {
        let prestige = |rarity| upgraded_prestige(item(kind, rarity));
        let unbought = |rarity| item(kind, rarity).prestige();
        assert_eq!(
            [prestige(Rarity::Rare), prestige(Rarity::Legendary), prestige(Rarity::Atheric)],
            [15, 27, 30],
            "{kind:?}"
        );
        assert_eq!([unbought(Rarity::Rare), unbought(Rarity::Legendary), unbought(Rarity::Atheric)], [13, 18, 21]);
    }
}

#[test]
fn a_player_reaches_level_twenty_between_a_factions_first_and_second_ranks() {
    // Destiny 1's ranks fell at 1,500, 3,500 and 6,000 reputation, a bounty paying 50 for 2,500 XP: some 175,000 and
    // 300,000 XP for the second and third ranks, so armour came about as a player reached level 20 and weapons later.
    let per_rank = factions().reputation_per_rank;
    let to_twenty = xp_for_level(20);
    assert!(per_rank <= to_twenty && to_twenty < 2 * per_rank, "{per_rank} a rank against {to_twenty} to level 20");
    // A package every rank from the third: at level 20's patrol pay, a few hours apart.
    let major_at_twenty = u64::from(at_level(worth(Foe::Swordsman, 2).xp, 20));
    assert!(per_rank / major_at_twenty >= 300, "{} Major kills a rank", per_rank / major_at_twenty);
}

#[test]
fn a_weeks_essence_finishes_about_one_legendary_piece_and_a_weeks_shapes_a_legendary() {
    let weekly = Weekly::Elite.essence() + Weekly::Abyss.essence();
    let playlists = Playlist::Elite.week_essence() + Playlist::Abyss.week_essence();
    let week = weekly + playlists + 7 * FIRST_HEROIC_ESSENCE;
    let piece = finishing(&item(Kind::Arms, Rarity::Legendary)).0.essence;
    assert!(piece <= week && week < 2 * piece, "{week} a week of each stock against {piece} a piece");
    // Xûr's 13 Strange Coins an exotic's armour, 23 its weapon: one in about a week and a half, the other in two
    // and a half, and a Legendary a week.
    let price = |kind: Kind, rarity| crate::shape::price(&item(kind, rarity));
    assert!(ABYSS_SHAPES >= price(Kind::Head, Rarity::Legendary));
    assert!(
        ABYSS_SHAPES < price(Kind::Head, Rarity::Atheric) && 2 * ABYSS_SHAPES >= price(Kind::Head, Rarity::Atheric)
    );
    assert!(
        2 * ABYSS_SHAPES < price(Kind::Bow, Rarity::Atheric) && 3 * ABYSS_SHAPES >= price(Kind::Bow, Rarity::Atheric)
    );
}

#[test]
fn a_bigger_task_pays_more_and_every_clear_and_chest_keeps_its_order() {
    let [one, two, three] = [1, 2, 3].map(|tier| bounty_pay(20, tier));
    assert!(one.0 < two.0 && two.0 < three.0 && one.1 < two.1 && two.1 < three.1);
    let [mission, dungeon, boss] = [Clear::Mission, Clear::Dungeon, Clear::WorldBoss].map(Clear::worth);
    assert!(mission.0 < dungeon.0 && dungeon.0 < boss.0 && mission.1 < dungeon.1 && dungeon.1 < boss.1);
    assert!(CHEST_XP.windows(2).all(|pair| pair[0] < pair[1]) && CHEST_AUREM.windows(2).all(|pair| pair[0] < pair[1]));
    // A sinking pays as twenty-one kills, so an hour at sea pays as a patrol zone's does (`band`).
    assert_eq!(SINKING_KILLS, 21);
}

/// The ledger, for the balance's record: pay by source and level, drops by rank, and what finishing each piece costs.
#[test]
#[ignore = "a measurement, printed by hand in release"]
fn measure_the_economy() {
    eprintln!("| Level | XP to the next | Major Swordsman's XP, Aurem | Majors to the next | Bounty (tier 1) |");
    for level in [1, 5, 10, 15, 19, 20, 25, 30] {
        let next = if level < 20 { xp_for_level(level + 1) - xp_for_level(level) } else { 0 };
        let major = worth(Foe::Swordsman, 2);
        let (xp, aurem) = (at_level(major.xp, level), at_level(major.aurem, level));
        let (bounty_xp, bounty_aurem) = bounty_pay(level, 1);
        eprintln!(
            "| {level} | {next} | {xp}, {aurem} | {} | {bounty_xp}, {bounty_aurem} |",
            next / u64::from(xp.max(1))
        );
    }
    eprintln!("\n| Rank | Vestige a kill | Legendary or better a kill, at 20 | XP, Aurem at 20 |");
    for rank in 1..=5_u8 {
        let weights = colours(rank);
        let best = f64::from(weights[3] + weights[4]) / f64::from(weights.iter().sum::<u32>());
        let paid = worth(Foe::Swordsman, rank);
        eprintln!(
            "| {rank} | {:.3} | {:.4} | {}, {} |",
            chance(rank),
            chance(rank) * best,
            at_level(paid.xp, 20),
            at_level(paid.aurem, 20)
        );
    }
    eprintln!("\n| Piece | Every node: Aurem, fragments, Essence, resource | One a column |");
    for (kind, rarity) in [
        (Kind::Sword, Rarity::Rare),
        (Kind::Sword, Rarity::Legendary),
        (Kind::Sword, Rarity::Atheric),
        (Kind::Head, Rarity::Rare),
        (Kind::Head, Rarity::Legendary),
        (Kind::Head, Rarity::Atheric),
        (Kind::Guns, Rarity::Legendary),
        (Kind::Hull, Rarity::Atheric),
    ] {
        let (every, one) = finishing(&item(kind, rarity));
        let row = |cost: Cost| format!("{}, {}, {}, {}", cost.aurem, cost.fragments, cost.essence, cost.resource);
        eprintln!("| {kind:?} {rarity:?} | {} | {} |", row(every), row(one));
    }
    let numbers = factions();
    eprintln!(
        "\nFactions: {} reputation a rank; cape {}, armour {} from rank {}, weapons {} from rank {}; a package {} Aurem, \
         Legendary {} from level {}.",
        numbers.reputation_per_rank,
        numbers.cape_aurem,
        numbers.armour_aurem,
        numbers.armour_rank,
        numbers.weapon_aurem,
        numbers.weapon_rank,
        numbers.package_aurem,
        numbers.package_legendary_share,
        numbers.package_legendary_from_level
    );
    eprintln!("Shapes: {ABYSS_SHAPES} a week; a sinking pays {SINKING_KILLS} kills of its rank.");
}
