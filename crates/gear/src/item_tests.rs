use crate::grid::{Column, columns, cost, node_offsets};
use crate::item::{Item, NAMED_LEVEL, NONE_CHOSEN};
use crate::kinds::{Kind, Slot};
use crate::rarity::Rarity;

/// An item with every upgrade bought, up to the `count`th.
fn upgraded(mut item: Item, count: usize) -> Item {
    let upgrades: Vec<usize> =
        item.columns().iter().enumerate().filter(|(_, column)| **column == Column::Upgrade).map(|(at, _)| at).collect();
    for column in upgrades.into_iter().take(count) {
        item.bought |= item.node_bit(column, 0).expect("an upgrade's node");
    }
    item
}

fn attacks(item: &Item) -> Vec<u32> {
    let (_, total) = item.upgrades();
    (0..=total as usize).filter_map(|count| upgraded(item.clone(), count).attack()).collect()
}

#[test]
fn a_legendary_climbs_from_248_to_300_and_an_atheric_from_260() {
    let legendary = Item::new(1, Kind::Sword, Rarity::Legendary, NAMED_LEVEL, Slot::Melee);
    assert_eq!(attacks(&legendary), [248, 258, 269, 279, 290, 300]);
    let atheric = Item::new(1, Kind::Bow, Rarity::Atheric, NAMED_LEVEL, Slot::Melee);
    assert_eq!(attacks(&atheric).first(), Some(&260));
    assert_eq!(attacks(&atheric).last(), Some(&300));
}

#[test]
fn a_forged_weapon_climbs_one_levels_attack_past_a_breachs_normal_one() {
    let breach = |hard| {
        let mut item = Item::new(1, Kind::Sword, Rarity::Legendary, NAMED_LEVEL, Slot::Melee);
        (item.breach, item.hard) = (true, hard);
        attacks(&item)
    };
    assert_eq!(breach(false), [248, 258, 269, 279, 290, 300], "Normal's as any Legendary's");
    let forged = breach(true);
    assert_eq!((forged[0], *forged.last().expect("its most")), (263, 315), "Forged, 15 more at each end");
    let reach = |attack| crate::power::by_player(attack, 29, 30);
    assert!(reach(315) > reach(300), "a level further against the foes of Hard, as its armour's level 30 is");
}

#[test]
fn a_lesser_weapon_rises_with_its_level_and_stays_under_a_legendary() {
    let at = |rarity, level| attacks(&Item::new(1, Kind::GreatAxe, rarity, level, Slot::Melee));
    let ends = |rarity| {
        let climbed = at(rarity, 20);
        (climbed[0], *climbed.last().expect("a weapon's Attack"))
    };
    assert_eq!(ends(Rarity::Normal), (204, 240));
    assert_eq!(ends(Rarity::Magic), (224, 264));
    assert_eq!(ends(Rarity::Rare), (240, 282));
    assert_eq!(*at(Rarity::Rare, 1).last().expect("a weapon's Attack"), 14);
    assert!(Item::new(1, Kind::Head, Rarity::Rare, 20, Slot::Head).attack().is_none(), "armour has no Attack");
}

#[test]
fn armour_carries_destiny_1s_prestige_from_level_20() {
    let prestige = |rarity, level, breach: Option<bool>| {
        let mut item = Item::new(1, Kind::Torso, rarity, level, Slot::Torso);
        (item.breach, item.hard) = (breach.is_some(), breach == Some(true));
        let (_, total) = item.upgrades();
        (item.prestige(), upgraded(item, total as usize).prestige())
    };
    assert_eq!(prestige(Rarity::Rare, 20, None), (13, 15));
    assert_eq!(prestige(Rarity::Rare, 19, None), (0, 0), "a Rare below level 20 carries none");
    assert_eq!(prestige(Rarity::Magic, 20, None), (0, 0));
    assert_eq!(prestige(Rarity::Legendary, 20, None), (18, 27));
    assert_eq!(prestige(Rarity::Legendary, 20, Some(false)), (19, 28), "a Breach's at Normal climbs to 28");
    assert_eq!(prestige(Rarity::Legendary, 20, Some(true)), (21, 30), "and at Hard to 30");
    assert_eq!(prestige(Rarity::Atheric, 20, None), (21, 30));
    assert_eq!(Item::new(1, Kind::SwordAndShield, Rarity::Atheric, 20, Slot::Melee).prestige(), 0, "nor a loadout");
}

#[test]
fn a_full_set_of_raid_like_armour_defends_to_its_level() {
    let full = |kind| {
        let item = Item::new(1, kind, Rarity::Atheric, NAMED_LEVEL, Slot::Head);
        let (_, total) = item.upgrades();
        upgraded(item, total as usize).defense().expect("armour's Defense")
    };
    let pieces = [full(Kind::Head), full(Kind::Arms), full(Kind::Torso), full(Kind::Legs)];
    assert_eq!(pieces, [422, 354, 456, 321], "Destiny 1's raid armour at 30, each with a quarter of a shield's share");
    let set: u32 = pieces.iter().sum();
    assert!((1_552..=1_554).contains(&set), "{set}: about 45 for each of 30 levels, and the share a shield carried");
    let lesser = Item::new(1, Kind::Head, Rarity::Normal, 1, Slot::Head);
    assert_eq!(lesser.defense(), Some(9), "a starting cap: 45 times 0.3125 times 0.8, less its upgrade");
}

#[test]
fn columns_unlock_as_the_item_earns_and_only_a_chosen_bought_trait_counts() {
    let mut item = Item::new(1, Kind::Sword, Rarity::Legendary, NAMED_LEVEL, Slot::Melee);
    item.layout = vec![
        vec!["light_grip".into(), "weighted".into(), "keen_edge".into()],
        vec!["riposte_master".into(), "guardbreaker".into()],
        vec!["steady".into(), "balanced".into()],
        vec!["bloodletter".into(), "executioner".into()],
    ];
    assert_eq!(item.xp_most(), 90_000, "nine columns of 10,000");
    assert!(!item.unlocked(0));
    item.xp = 10_000;
    assert!(item.unlocked(0) && !item.unlocked(1));
    assert_eq!(item.traits_of(2), ["riposte_master", "guardbreaker"], "the second trait column");
    assert!(item.traits_of(1).is_empty(), "an upgrade offers no trait");
    item.bought |= item.node_bit(0, 1).expect("weighted's node");
    assert_eq!(item.active_traits().count(), 0, "bought but not chosen");
    item.chosen[0] = 1;
    assert_eq!(item.active_traits().collect::<Vec<_>>(), ["weighted"]);
    item.chosen[0] = 2;
    assert_eq!(item.active_traits().count(), 0, "chosen but not bought");
    assert_eq!(item.chosen.len(), columns(Rarity::Legendary, true).len());
    assert!(item.chosen[1..].iter().all(|chosen| *chosen == NONE_CHOSEN));
}

#[test]
fn a_legendarys_last_three_nodes_ask_for_six_essence_each() {
    let weapon = columns(Rarity::Legendary, true);
    let essence: Vec<u16> = (0..weapon.len()).map(|column| cost(Rarity::Legendary, weapon, column).essence).collect();
    assert_eq!(essence.iter().sum::<u16>(), 18);
    assert_eq!(essence, [0, 0, 0, 0, 0, 0, 6, 6, 6]);
    assert_eq!(cost(Rarity::Legendary, weapon, 1).resource, 10, "an earlier upgrade asks for the island's resource");
    let armour = columns(Rarity::Legendary, false);
    let armour_essence: u16 = (0..armour.len()).map(|column| cost(Rarity::Legendary, armour, column).essence).sum();
    assert_eq!(armour_essence, 18, "Destiny 1: 6 Ascendant Shards for each of armour's last three");
    let atheric = columns(Rarity::Atheric, true);
    assert_eq!(cost(Rarity::Atheric, atheric, 2).essence, 1, "an Atheric's own node");
    assert_eq!(cost(Rarity::Normal, columns(Rarity::Normal, true), 0).aurem, 100);
    assert_eq!(node_offsets(weapon).1, 14, "a Legendary weapon's nodes fit its bits");
}

#[test]
fn a_shields_block_perk_rolls_and_counts_only_on_a_loadout_with_a_shield() {
    let pooled = |kind: Kind| {
        crate::catalogue::catalogue().pool(Column::Perk(2), kind).iter().any(|found| found.id == "bulwark")
    };
    for kind in Kind::ALL.into_iter().filter(|kind| *kind != Kind::Cloak) {
        assert_eq!(pooled(kind), kind.shielded(), "{kind:?}");
    }
    // A piece offering it, as a kept one may: its node bought and chosen.
    let worn = |kind: Kind, layout: Vec<Vec<String>>, column: usize| {
        let mut item = Item::new(1, kind, Rarity::Rare, 10, kind.slot());
        item.layout = layout;
        item.bought |= item.node_bit(column, 0).expect("bulwark's node");
        item.chosen[column] = 0;
        item.active_traits().map(str::to_owned).collect::<Vec<_>>()
    };
    let pair = |first: &str, second: &str| vec![first.to_owned(), second.to_owned()];
    let helm = vec![pair("bulwark", "hardy"), pair("unshaken", "scholar")];
    assert!(worn(Kind::Head, helm, 0).is_empty(), "armour gives no Bulwark");
    let sword = vec![pair("light_grip", "weighted"), pair("bulwark", "executioner"), pair("honed", "steady")];
    assert!(worn(Kind::Sword, sword.clone(), 2).is_empty(), "nor a loadout with no shield");
    assert_eq!(worn(Kind::SwordAndShield, sword, 2), ["bulwark"]);
}
