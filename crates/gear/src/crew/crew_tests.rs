use super::officer::{GRADES, Officer, Post};
use super::recruit::{self, offers, pool, taken, wage};
use super::{ASHORE_MOST, Duty, OFFICERS_MOST};
use crate::asks::{Ask, Here, Refusal};
use crate::catalogue::catalogue;
use crate::character::Character;
use crate::dice::Dice;
use crate::power;
use crate::rarity::Rarity;

fn counter(pledge: u8, rank: u32) -> Here {
    Here { social: true, day: 4, pledge, rank, week: 0 }
}

fn dice(tick: u64) -> Dice {
    Dice { seed: 11, tick, player: 2 }
}

#[test]
fn the_crews_names_read_whole_and_every_post_has_perks_enough_for_a_veteran() {
    assert!(recruit::names().given.len() >= 20 && recruit::names().family.len() >= 20);
    for post in Post::ALL {
        let traits = pool(post);
        assert!(traits.len() >= 6, "{post:?} offers {}", traits.len());
        let mut trim = crate::ship::trim::ShipTrim::default();
        let known = traits.iter().filter(|id| trim.take(id)).count();
        let ashore = ["weathered", "brawler", "old_salt", "steady_nerve"];
        assert_eq!(known + ashore.iter().filter(|id| traits.contains(id)).count(), traits.len(), "{post:?}");
    }
}

#[test]
fn every_modules_trait_does_what_the_sea_reads() {
    let content = catalogue();
    let mut trim = crate::ship::trim::ShipTrim::default();
    for item in content.items.iter().filter(|item| item.kind.module()) {
        for id in item.layout.iter().flatten() {
            assert!(trim.take(id), "{} offers {id}, which the sea does not know", item.id);
        }
    }
    assert!(content.problems().is_empty(), "{:?}", content.problems());
}

#[test]
fn a_counter_offers_three_a_day_the_better_grades_by_rank_the_same_to_everyone() {
    let plain = offers(1, 9, 12, 0);
    assert_eq!(plain.iter().map(|officer| officer.grade).collect::<Vec<_>>(), [Rarity::Magic; 3]);
    let ranked = offers(1, 9, 12, 4);
    assert_eq!(ranked.iter().map(|officer| officer.grade).collect::<Vec<_>>(), GRADES);
    assert_eq!(offers(1, 9, 12, 4), ranked);
    assert_ne!(offers(2, 9, 12, 4), ranked, "each faction offers its own");
    assert!(ranked.iter().all(|officer| power::xp_level(u64::from(officer.xp)) == 12));
    let veteran = &ranked[2];
    assert_eq!(veteran.layout.iter().map(Vec::len).collect::<Vec<_>>(), [2, 2, 2]);
    let offered: Vec<&String> = veteran.layout.iter().flatten().collect();
    assert!(offered.iter().all(|id| pool(veteran.post).contains(&id.as_str())));
    let mut unique = offered.clone();
    unique.dedup();
    assert_eq!(unique.len(), offered.len());
}

#[test]
fn an_officer_is_signed_on_only_at_a_pledged_counter_for_their_wage() {
    let mut character = Character::starting();
    let first = Ask::Recruit { faction: 1, offer: 0 };
    assert_eq!(character.ask(first, Here { social: false, ..counter(1, 0) }, &dice(0)), Err(Refusal::NotHere));
    assert_eq!(character.ask(first, counter(0, 0), &dice(0)), Err(Refusal::NoPledge));
    assert_eq!(character.ask(first, counter(2, 0), &dice(0)), Err(Refusal::NoPledge), "only the faction pledged to");
    assert_eq!(character.ask(first, counter(1, 0), &dice(0)), Err(Refusal::Short));
    character.materials.aurem = 20_000;
    character.ask(first, counter(1, 0), &dice(0)).expect("signed on");
    assert_eq!(character.materials.aurem, 20_000 - wage(Rarity::Magic));
    assert_eq!(
        character.ask(first, counter(1, 0), &dice(0)),
        Err(Refusal::OfficerKept),
        "one officer is signed on once"
    );
    let officer = character.crew.officers.values().next().expect("kept");
    assert_eq!(officer.duty, Duty::Aboard);
    let kept = Character::from_json(&character.to_json()).expect("read");
    assert_eq!(kept.crew, character.crew);
}

fn with_officers(posts: &[Post]) -> (Character, Vec<u32>) {
    let mut character = Character::starting();
    let ids = posts
        .iter()
        .enumerate()
        .map(|(nth, post)| {
            let mut officer =
                recruit::rolled(*post, Rarity::Legendary, 20, &dice(nth as u64), crate::dice::Purpose::Recruit, 0);
            officer.given = nth as u8;
            character.sign_on(officer).expect("room")
        })
        .collect();
    (character, ids)
}

#[test]
fn one_officer_holds_each_post_two_go_ashore_and_eight_are_kept() {
    let (mut character, ids) = with_officers(&[Post::Gunner, Post::Gunner, Post::Bosun, Post::Lookout]);
    let here = Here::default();
    character.ask(Ask::Station { officer: ids[0], duty: Duty::Posted }, here, &dice(0)).expect("posted");
    character.ask(Ask::Station { officer: ids[1], duty: Duty::Posted }, here, &dice(0)).expect("posted");
    let posted = character.crew.officers.values().find(|each| each.duty == Duty::Posted && each.post == Post::Gunner);
    assert_eq!(posted.map(|officer| officer.id), Some(ids[1]));
    assert_eq!(character.crew.officers[&ids[0]].duty, Duty::Aboard, "the one there goes aboard");
    for id in &ids[2..] {
        character.ask(Ask::Station { officer: *id, duty: Duty::Ashore }, here, &dice(0)).expect("ashore");
    }
    assert_eq!(character.crew.ashore().count(), ASHORE_MOST);
    let third = Ask::Station { officer: ids[0], duty: Duty::Ashore };
    assert_eq!(character.ask(third, here, &dice(0)), Err(Refusal::AshoreFull));
    while character.crew.officers.len() < OFFICERS_MOST {
        character.sign_on(Officer::new(0, Post::Carpenter, Rarity::Magic, 1)).expect("room");
    }
    assert!(character.sign_on(Officer::new(0, Post::Carpenter, Rarity::Magic, 1)).is_none());
    character.ask(Ask::Dismiss { officer: ids[0] }, here, &dice(0)).expect("paid off");
    assert!(!character.crew.officers.contains_key(&ids[0]));
}

#[test]
fn a_posted_officer_changes_its_trim_by_their_post_and_their_perks_and_one_aboard_changes_nothing() {
    let (mut character, ids) = with_officers(&[Post::Gunner, Post::FirstMate]);
    let plain = character.ship_trim();
    assert_eq!(plain, crate::ship::trim::ShipTrim::default());
    character.ask(Ask::Station { officer: ids[0], duty: Duty::Posted }, Here::default(), &dice(0)).expect("posted");
    character.ask(Ask::Station { officer: ids[1], duty: Duty::Posted }, Here::default(), &dice(0)).expect("posted");
    let trim = character.ship_trim();
    let gunner = character.crew.officers[&ids[0]].strength();
    assert!((trim.reload - (1.0 - 0.1 * gunner)).abs() < 1e-12);
    assert!(trim.post(Post::Gunner) > 0.0 && trim.post(Post::Bosun) == 0.0);
    assert!(trim.boarders >= 2 && trim.crew_taken < 1.0);
}

#[test]
fn an_officer_trains_through_their_grid_and_past_twenty_their_upgrades_carry_them() {
    let (mut character, ids) = with_officers(&[Post::Lookout]);
    let id = ids[0];
    let here = Here::default();
    let buy = Ask::Train { officer: id, column: 0, node: 1 };
    assert_eq!(character.ask(buy, here, &dice(0)), Err(Refusal::Locked));
    character.earn_officer_xp(u32::MAX, true);
    character.materials.aurem = 25_000;
    character.ask(buy, here, &dice(0)).expect("bought");
    let officer = &character.crew.officers[&id];
    assert_eq!(officer.active_traits().count(), 1, "the first bought is chosen at once");
    assert_eq!(officer.level(), 20);
    let upgrade = |column| Ask::Train { officer: id, column, node: 0 };
    assert_eq!(character.ask(upgrade(1), here, &dice(0)), Err(Refusal::Short), "a Veteran's upgrades ask Heartwood");
    character.materials.ship.heartwood = 18;
    for column in [1, 3, 5] {
        character.ask(upgrade(column), here, &dice(0)).expect("upgrade");
    }
    assert_eq!(character.materials.ship.heartwood, 0);
    assert_eq!(character.crew.officers[&id].level(), 29);
    assert!((character.crew.officers[&id].strength() - 1.0).abs() < 1e-12);
    let choose = Ask::ChooseOfficer { officer: id, column: 0, node: 0 };
    assert_eq!(character.ask(choose, here, &dice(0)), Err(Refusal::NotBought));
}

#[test]
fn officers_earn_where_they_serve() {
    let (mut character, ids) = with_officers(&[Post::Bosun, Post::Carpenter]);
    character.ask(Ask::Station { officer: ids[1], duty: Duty::Ashore }, Here::default(), &dice(0)).expect("ashore");
    let before = character.crew.officers.clone();
    character.earn_officer_xp(500, true);
    assert_eq!(character.crew.officers[&ids[0]].trained, before[&ids[0]].trained + 500);
    assert_eq!(character.crew.officers[&ids[1]].trained, before[&ids[1]].trained);
    character.earn_officer_xp(500, false);
    assert_eq!(character.crew.officers[&ids[1]].trained, 500);
}

#[test]
fn a_won_deck_rarely_gives_an_officer_more_often_and_better_from_a_higher_rank() {
    let joins = |rank: u8| (0..2_000).filter_map(|tick| taken(rank, 14, &dice(tick))).collect::<Vec<_>>();
    let (minor, boss) = (joins(1), joins(5));
    assert!((30..100).contains(&minor.len()), "a Minor's about one deck in 33: {}", minor.len());
    assert!((500..700).contains(&boss.len()), "a Boss's about one in 3: {}", boss.len());
    assert!(minor.iter().all(|officer| officer.grade == Rarity::Magic));
    assert!(boss.iter().all(|officer| officer.grade == Rarity::Legendary));
}

#[test]
fn a_kept_crew_is_made_whole() {
    let (mut character, ids) = with_officers(&[Post::Gunner, Post::Gunner, Post::Bosun, Post::Lookout, Post::Lookout]);
    for (nth, id) in ids.iter().enumerate() {
        let officer = character.crew.officers.get_mut(id).expect("kept");
        officer.duty = if nth < 2 { Duty::Posted } else { Duty::Ashore };
        officer.bought = u32::MAX;
        officer.chosen = vec![9; 2];
    }
    let read = Character::from_json(&character.to_json()).expect("read");
    assert_eq!(read.crew.officers.values().filter(|officer| officer.duty == Duty::Posted).count(), 1);
    assert_eq!(read.crew.ashore().count(), ASHORE_MOST);
    let officer = &read.crew.officers[&ids[0]];
    assert_eq!(officer.bought, (1 << 9) - 1);
    assert_eq!(officer.chosen, vec![crate::item::NONE_CHOSEN; 6]);
    assert!(read.take_id_clear_of(&ids));
}

#[test]
fn a_posted_lookout_sights_ships_farther_by_how_well_they_hold_their_post() {
    let (mut character, ids) = with_officers(&[Post::Lookout]);
    assert!((character.ship_trim().sight - 1.0).abs() < 1e-12, "aboard, they change nothing");
    character.ask(Ask::Station { officer: ids[0], duty: Duty::Posted }, Here::default(), &dice(0)).expect("posted");
    let strength = character.crew.officers[&ids[0]].strength();
    let perks = character.crew.officers[&ids[0]].active_traits().count();
    assert_eq!(perks, 0, "nothing bought yet");
    assert!((character.ship_trim().sight - (1.0 + 0.4 * strength)).abs() < 1e-12);
}

#[test]
fn an_officers_way_to_their_next_level_runs_on_past_20_by_their_upgrades_bought() {
    let mut officer = Officer::new(0, Post::Gunner, Rarity::Rare, 20);
    officer.xp = u32::try_from(power::xp_for_level(power::XP_LEVEL_MOST)).unwrap();
    assert_eq!(officer.level(), 20);
    assert_eq!(officer.to_next(), 0.0, "none bought yet");
    let upgrades: Vec<usize> = officer
        .columns()
        .iter()
        .enumerate()
        .filter(|(_, column)| **column == crate::grid::Column::Upgrade)
        .map(|(index, _)| index)
        .collect();
    assert!(upgrades.len() > 1);
    officer.bought |= officer.node_bit(upgrades[0], 0).unwrap();
    assert_eq!(officer.level(), 22, "a Seasoned officer's upgrade carries them two levels");
    let share = officer.to_next();
    assert!((share - 1.0 / upgrades.len() as f64).abs() < 1e-12, "one of their upgrades: {share}");
    let young = Officer::new(0, Post::Gunner, Rarity::Rare, 5);
    assert_eq!(young.to_next(), power::to_next(u64::from(young.xp), 0).0, "under 20, their experience's");
}
