//! A carried errand: kept with the character, settled once when its answer is written in.

use crate::asks::Refusal;
use crate::character::Character;
use crate::errand::{Carried, LIMITED, Material, What, settle};
use crate::ship::materials::ShipMaterial;

#[test]
fn a_carried_errand_is_kept_with_the_character_and_settled_once_its_answer_is_written_in() {
    let mut character = Character::starting();
    character.materials.aurem = 100;
    character.errand =
        Some(Carried { rid: "node-a--guild-b:1:2:3".to_owned(), what: What::Deposit(500), answer: None });
    let kept = character.to_json();
    let read = Character::from_json(&kept).expect("a character");
    assert_eq!(read.errand, character.errand, "unanswered, it is carried on");
    assert_eq!(read.materials.aurem, 100);
    let mut body: serde_json::Value = serde_json::from_str(&kept).expect("json");
    body["errand"]["answer"] = serde_json::json!(200);
    let settled = Character::from_json(&body.to_string()).expect("a character");
    assert_eq!(settled.errand, None, "carried no more");
    assert_eq!(settled.materials.aurem, 400, "the 300 the treasury did not take");
    let again = Character::from_json(&settled.to_json()).expect("a character");
    assert_eq!(again.materials.aurem, 400, "given once");
}

#[test]
fn a_carried_errand_is_written_as_the_host_reads_it() {
    let timber = Material::Ship(ShipMaterial::Timber);
    let carried =
        Carried { rid: "r".to_owned(), what: What::Deliver { structure: 3, stuff: timber, amount: 20 }, answer: None };
    let written = serde_json::to_value(&carried).expect("json");
    let deliver = serde_json::json!({ "structure": 3, "stuff": { "ship": "timber" }, "amount": 20 });
    assert_eq!(written, serde_json::json!({ "rid": "r", "what": { "deliver": deliver } }));
    let island = serde_json::to_value(What::Take { stuff: Material::Island(2), amount: 5 }).expect("json");
    assert_eq!(island, serde_json::json!({ "take": { "stuff": { "island": 2 }, "amount": 5 } }));
}

#[test]
fn past_the_accounts_limit_an_errand_gives_back_all_and_says_so() {
    let mut character = Character::starting();
    let timber = Material::Ship(ShipMaterial::Timber);
    let errands = [
        What::Deposit(50),
        What::Deliver { structure: 1, stuff: timber, amount: 5 },
        What::Take { stuff: timber, amount: 5 },
        What::Horn,
    ];
    for what in errands {
        let before = character.materials.clone();
        assert_eq!(settle(&mut character.materials, what, Some(LIMITED)), Some(Refusal::TooManyAsks), "{what:?}");
        let given_back = What::Deposit(50) == what || matches!(what, What::Deliver { .. });
        assert!(given_back || character.materials == before, "a take gives nothing, the horn takes nothing");
    }
    assert_eq!(character.materials.aurem, Character::starting().materials.aurem + 50);
    assert_eq!(character.materials.ship.timber, Character::starting().materials.ship.timber + 5);
}
