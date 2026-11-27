//! Each dungeon's room gives its drops from its own content, which their looks follow: a patrol's dungeon a dungeon's,
//! an Elite Dungeon an Elite Dungeon's at Normal and Elite and an Abyss Dungeon's at Abyss, a sea island's a sea
//! dungeon's; and every other room the world's.

use super::*;
use crate::PlayerId;
use combat::Action;
use gear::Source;

/// A Friday's 09:00 UTC: day 20,778, in week 2,968, whose Abyss Dungeon is the Saltworm Warrens.
const FRIDAY_NINE: u64 = 29_919_420;

#[test]
fn each_dungeons_room_gives_from_its_own_content() {
    let run = |of: RunOf, tier| Room::dungeon_run(&of, tier, FRIDAY_NINE).expect("a run").source;
    let elite = |place: &str| RunOf::Elite { place: place.into() };
    let patrol = RunOf::Patrol { patrol: "saltgrass-downs".into(), number: 1 };
    let sea = RunOf::Sea { seed: 7, style: "crypt".into(), continent: "continent-4".into() };
    assert_eq!(run(patrol.clone(), Difficulty::Normal), Source::Dungeon);
    assert_eq!(run(patrol, Difficulty::Abyss), Source::Dungeon, "a patrol's dungeon at any tier");
    assert_eq!(run(elite("krakens-grotto"), Difficulty::Normal), Source::Elite);
    assert_eq!(run(elite("saltworm-warrens"), Difficulty::Abyss), Source::Abyss, "the week's Abyss Dungeon");
    let playlist = |foes_at| RunOf::Playlist { place: "pearl-tomb".into(), foes_at };
    assert_eq!(run(playlist(22), Difficulty::Elite), Source::Elite, "the Elite Playlist");
    assert_eq!(run(playlist(23), Difficulty::Abyss), Source::Abyss, "the Abyss Playlist");
    assert_eq!(run(sea.clone(), Difficulty::Normal), Source::Sea);
    assert_eq!(run(sea, Difficulty::Elite), Source::Sea);
    assert_eq!(Room::dungeon("saltgrass-downs", 0, None).expect("shared").source, Source::Dungeon);
}

#[test]
fn an_elite_dungeons_clear_lays_its_vestiges_and_items_from_its_content() {
    let mut paid = (0, 0);
    for place in ["krakens-grotto", "pearl-tomb", "cinder-deep", "hollow-crypt", "barrow-halls", "coral-halls"] {
        let mut room =
            Room::dungeon_run(&RunOf::Elite { place: place.into() }, Difficulty::Normal, FRIDAY_NINE).expect(place);
        let mut character = gear::Character::starting();
        character.story.prologue = true;
        let player: PlayerId = room.join().expect("a room with space");
        assert!(room.restore_character(player, &character.to_json()));
        // Its Boss stands only once its seals are broken.
        for seal in &mut room.encounters.as_mut().expect("its encounters").seals {
            seal.state = crate::encounters::SealState::Broken;
        }
        room.tick();
        for id in room.garrison[0].standing.clone() {
            let found = room.foes.get_mut(&id).expect("standing");
            (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: 0 });
        }
        room.tick();
        let lying: Vec<&gear::Vestige> = room
            .drops
            .iter()
            .filter_map(|drop| match &drop.what {
                crate::Dropped::Vestige(vestige) if drop.player == player => Some(vestige),
                _ => None,
            })
            .collect();
        assert!(lying.iter().all(|vestige| vestige.source == Source::Elite), "{place}");
        let rolled: Vec<&gear::Item> = (room.drops.iter())
            .filter_map(|drop| match &drop.what {
                crate::Dropped::Item(item, _) if drop.player == player && item.named.is_none() => Some(item),
                _ => None,
            })
            .collect();
        assert!(rolled.iter().all(|item| item.source == Source::Elite), "{place}");
        paid = (paid.0 + lying.len(), paid.1 + rolled.len());
    }
    assert!(paid.0 > 0 && paid.1 > 0, "the clears laid Vestiges and items: {paid:?}");
}
