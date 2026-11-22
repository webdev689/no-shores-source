//! Cosmetics: the catalogue read whole, the start's kept and worn, each seller's wares of the day, buying and wearing.

use crate::asks::{Ask, Here, Refusal};
use crate::character::Character;
use crate::cosmetics::{CosmeticKind, SOLD_A_DAY, Seller, cosmetics, number_of, sold_on};
use crate::dice::Dice;
use crate::emblems::Source;

const AT_COUNTER: Here = Here { social: true, day: 20_400, pledge: 0, rank: 0, week: 0 };
const DICE: Dice = Dice { seed: 1, tick: 1, player: 1 };

#[test]
fn the_catalogue_reads_whole_with_one_start_of_each_kind() {
    for kind in [CosmeticKind::Dye, CosmeticKind::Coat, CosmeticKind::Barding] {
        let starts = cosmetics().iter().filter(|found| found.kind == kind && found.source == Source::Start).count();
        assert_eq!(starts, 1, "{kind:?}");
    }
    let mut ids: Vec<&str> = cosmetics().iter().map(|found| found.id.as_str()).collect();
    ids.sort_unstable();
    ids.dedup();
    assert_eq!(ids.len(), cosmetics().len(), "no id twice");
}

#[test]
fn a_new_player_keeps_and_wears_the_starts() {
    let character = Character::starting();
    let worn = &character.cosmetics;
    assert_eq!((worn.dye.as_str(), worn.coat.as_str(), worn.barding.as_str()), ("own_colours", "bay", "bare"));
    assert!(character.keeps_cosmetic("bay") && !character.keeps_cosmetic("ember_plate"));
}

#[test]
fn each_seller_shows_a_few_of_its_own_the_same_all_day() {
    for seller in [Seller::Tailor, Seller::Tack] {
        let today = sold_on(seller, 20_400);
        assert_eq!(today.len(), SOLD_A_DAY);
        assert_eq!(today, sold_on(seller, 20_400));
        for number in &today {
            let found = &cosmetics()[usize::from(*number)];
            assert_eq!(found.kind.seller(), seller);
            assert!(matches!(found.source, Source::Sold { .. }));
        }
    }
    let days: Vec<Vec<u16>> = (0..20).map(|day| sold_on(Seller::Tack, day)).collect();
    assert!(days.windows(2).any(|pair| pair[0] != pair[1]), "the wares turn with the days");
}

#[test]
fn a_cosmetic_is_bought_at_its_counter_once_and_worn_in_its_kind() {
    let mut character = Character::starting();
    character.materials.aurem = 25_000;
    let sold = sold_on(Seller::Tack, AT_COUNTER.day);
    let cheap = sold
        .iter()
        .copied()
        .find(|number| matches!(cosmetics()[usize::from(*number)].source, Source::Sold { level: 1, .. }));
    let number = cheap.expect("a mount piece for any level that day");
    let found = &cosmetics()[usize::from(number)];
    assert_eq!(character.ask(Ask::WearCosmetic { cosmetic: number }, AT_COUNTER, &DICE), Err(Refusal::NotKept));
    let afield = Here { social: false, ..AT_COUNTER };
    assert_eq!(character.ask(Ask::BuyCosmetic { cosmetic: number }, afield, &DICE), Err(Refusal::NotHere));
    assert!(character.ask(Ask::BuyCosmetic { cosmetic: number }, AT_COUNTER, &DICE).is_ok());
    assert!(character.keeps_cosmetic(&found.id));
    assert_eq!(character.ask(Ask::BuyCosmetic { cosmetic: number }, AT_COUNTER, &DICE), Err(Refusal::Kept));
    assert!(character.ask(Ask::WearCosmetic { cosmetic: number }, Here::default(), &DICE).is_ok(), "worn anywhere");
    assert_eq!(character.cosmetics.worn(found.kind), found.id);
    let unsold = (0..cosmetics().len()).filter_map(|at| u16::try_from(at).ok()).find(|at| !sold.contains(at));
    let unsold = unsold.expect("one not sold today");
    assert_eq!(character.ask(Ask::BuyCosmetic { cosmetic: unsold }, AT_COUNTER, &DICE), Err(Refusal::NotSold));
    let back = Character::from_json(&character.to_json()).expect("a character");
    assert_eq!(back.cosmetics, character.cosmetics);
}

#[test]
fn a_worn_cosmetic_not_kept_or_of_the_wrong_kind_is_the_start_once_read() {
    let mut character = Character::starting();
    character.cosmetics.dye = "ember_plate".to_owned();
    character.cosmetics.coat = "palomino".to_owned();
    let back = Character::from_json(&character.to_json()).expect("a character");
    assert_eq!((back.cosmetics.dye.as_str(), back.cosmetics.coat.as_str()), ("own_colours", "bay"));
    assert_eq!(number_of("own_colours"), Some(0));
}

/// A level 20 player of the Veiled's `rank`, pledged to them, who bought and wears each of the Veiled's wares named,
/// by its place among them, in its slot.
fn veiled_wearing(rank: u64, wares: &[(u8, crate::kinds::Slot)]) -> Character {
    let mut character = Character::starting();
    character.allegiance = std::mem::take(&mut character.allegiance).kept();
    character.allegiance.pledge = 3;
    character.allegiance.reputation[2] = rank * crate::factions::factions().reputation_per_rank;
    character.materials.aurem = 1_000_000;
    character.xp = crate::power::xp_for_level(20);
    for &(ware, slot) in wares {
        let named = &crate::factions::wares(3)[usize::from(ware)].id;
        assert_eq!(character.ask(Ask::BuyFactionWare { faction: 3, ware }, AT_COUNTER, &DICE).map(|_| ()), Ok(()));
        let item =
            character.items.values().find(|(item, _)| item.named.as_ref() == Some(named)).map(|(item, _)| item.id);
        let wear = Ask::Wear { item: item.expect("the ware bought"), slot };
        assert_eq!(character.ask(wear, AT_COUNTER, &DICE).map(|_| ()), Ok(()), "{named} worn");
    }
    character
}

/// The outfit of `sent` as the room relays it for `character`.
fn relayed(sent: &str, character: &Character) -> serde_json::Value {
    let dress = crate::cosmetics::dressed(sent, character).expect("a dress that reads");
    serde_json::from_str::<serde_json::Value>(&dress).expect("a dress")["outfit"].clone()
}

/// The dyes of `sent`'s outfit as the room relays them for `character`.
fn relayed_dyes(sent: &str, character: &Character) -> serde_json::Value {
    relayed(sent, character)["dyes"].clone()
}

#[test]
fn a_dress_shows_a_factions_colour_only_on_the_layers_of_its_pieces_worn() {
    use crate::kinds::Slot;
    let sent = r#"{"outfit":{"dyes":{"helm_brotherhood":"veiled","cuirass_steel":"veiled","under_steel":"veiled",
        "formal_cloak":"heather","bow_ebony":"veiled","sword_iron":"veiled","breeches":"White"}}}"#;
    let none = relayed_dyes(sent, &Character::starting());
    assert_eq!(none, serde_json::json!({ "breeches": "White" }), "a plain cloth dye stays, no faction's colour");
    let cowl = relayed_dyes(sent, &veiled_wearing(3, &[(1, Slot::Head)]));
    assert_eq!(cowl, serde_json::json!({ "helm_brotherhood": "veiled", "breeches": "White" }), "the cowl's helm alone");
    let coat = relayed_dyes(sent, &veiled_wearing(3, &[(2, Slot::Torso)]));
    let padded = serde_json::json!({ "cuirass_steel": "veiled", "under_steel": "veiled", "breeches": "White" });
    assert_eq!(coat, padded, "the coat's cuirass and its padding, in whatever set the page draws");
    let bow = relayed_dyes(sent, &veiled_wearing(3, &[(6, Slot::Ranged)]));
    assert_eq!(bow, serde_json::json!({ "bow_ebony": "veiled", "breeches": "White" }), "the bow, never the sword");
    let every = r#"{"outfit":{"dyes":{"pauldrons_steel":"veiled","gauntlets_iron":"veiled","greaves_iron":"veiled",
        "boots_iron":"veiled","dagger_ebony":"veiled","shield_ebony":"veiled","dagger_ebony_l":"veiled"}}}"#;
    let bare = relayed_dyes(every, &veiled_wearing(3, &[]));
    assert_eq!(bare, serde_json::json!({}), "none of them with none of the pieces");
    let pieces = [(2, Slot::Torso), (3, Slot::Arms), (4, Slot::Legs), (5, Slot::Melee), (6, Slot::Ranged)];
    let whole: serde_json::Value =
        serde_json::from_str::<serde_json::Value>(every).expect("a dress")["outfit"]["dyes"].clone();
    assert_eq!(relayed_dyes(every, &veiled_wearing(3, &pieces)), whole, "each on its own piece, both loadouts worn");
}

#[test]
fn a_capes_dye_stands_only_on_the_cape_and_a_dye_kept_anywhere() {
    use crate::kinds::Slot;
    let sent =
        r#"{"outfit":{"dyes":{"formal_cloak":"veiled_dusk","breeches":"veiled_dusk","cuirass_steel":"veiled"}}}"#;
    let mut caped = veiled_wearing(0, &[(0, Slot::Cloak)]);
    assert!(!caped.keeps_cosmetic("veiled_dusk"));
    assert_eq!(relayed_dyes(sent, &caped), serde_json::json!({ "formal_cloak": "veiled_dusk" }), "the cape's own dye");
    caped.cosmetics.kept.push("veiled_dusk".to_owned());
    let kept = serde_json::json!({ "formal_cloak": "veiled_dusk", "breeches": "veiled_dusk" });
    assert_eq!(relayed_dyes(sent, &caped), kept, "a dye kept on any layer; the cape never gives the faction's key");
}

#[test]
fn a_dress_that_is_not_an_object_with_an_outfit_does_not_read() {
    for sent in ["not a dress", "[1,2]", r#"{"body":"m"}"#, r#"{"outfit":3}"#] {
        assert_eq!(crate::cosmetics::read_dress(sent), None);
        assert_eq!(crate::cosmetics::dressed(sent, &Character::starting()), None);
    }
}

#[test]
fn a_dress_shows_armour_and_hands_only_of_the_pieces_worn() {
    use crate::character::At;
    use crate::kinds::Slot;
    let only = |slots: &[Slot]| {
        let mut character = veiled_wearing(3, &[(1, Slot::Head), (6, Slot::Ranged)]);
        character.items.retain(|_, (_, at)| !matches!(at, At::Worn(slot) if !slots.contains(slot)));
        character
    };
    let sent = r#"{"outfit":{"armour":{"helm":"steel","cuirass":"daedric","boots":"iron","greaves":7},
        "right":"bow_long_ebony","left":"shield_kite_iron","drawn":true}}"#;
    let cowl = relayed(sent, &only(&[Slot::Head, Slot::Ranged]));
    assert_eq!(cowl["armour"], serde_json::json!({ "helm": "steel" }), "the helm alone of the armour");
    assert_eq!((&cowl["right"], &cowl["left"]), (&serde_json::json!("bow_long_ebony"), &serde_json::Value::Null));
    let lit = r#"{"outfit":{"right":"sword_iron","left":"torch_l"}}"#;
    let bare = relayed(lit, &only(&[]));
    assert_eq!((&bare["right"], &bare["left"]), (&serde_json::Value::Null, &serde_json::json!("torch_l")), "a light");
    let start = relayed(sent, &Character::starting());
    let armour = serde_json::json!({ "helm": "steel", "cuirass": "daedric", "boots": "iron" });
    assert_eq!(start["armour"], armour, "a starting character wears every armour slot, and its sword");
    assert_eq!(relayed(lit, &Character::starting())["right"], serde_json::json!("sword_iron"));
}
