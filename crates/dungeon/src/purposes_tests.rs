use crate::{Dungeon, STYLES, Shape};

fn every_dungeon(count: u32) -> impl Iterator<Item = Dungeon> {
    (0..count).map(|seed| Dungeon::forge(seed.wrapping_mul(2_654_435_761), STYLES[seed as usize % STYLES.len()]))
}

/// The rooms in the order the walk reaches them, as their purposes are drawn.
fn along_the_walk(dungeon: &Dungeon) -> Vec<usize> {
    let mut order: Vec<usize> = (0..dungeon.rooms.len()).collect();
    order.sort_by_key(|&room| (dungeon.rooms[room].walk, room));
    order
}

#[test]
fn the_way_in_and_the_end_take_their_own_and_every_other_room_one_of_its_banks() {
    for dungeon in every_dungeon(600) {
        assert_eq!(*dungeon.rooms[dungeon.way_in.room].purpose, dungeon.style.purposes.way_in);
        let end = &dungeon.rooms[dungeon.end()];
        assert_eq!(*end.purpose, dungeon.looks[end.look].purposes.end, "the end's own, in its block's style");
        for (number, room) in dungeon.rooms.iter().enumerate() {
            if number != dungeon.way_in.room && number != dungeon.end() {
                assert!(dungeon.looks[room.look].purposes.rooms.contains(room.purpose), "{}", room.name);
                assert!(room.purpose.suits(room.shape), "{} suits its shape", room.name);
            }
        }
    }
}

#[test]
fn no_purpose_is_used_again_while_one_its_room_suits_is_left_unused() {
    for dungeon in every_dungeon(1200) {
        let mut uses: Vec<Vec<usize>> = dungeon.looks.iter().map(|look| vec![0; look.purposes.rooms.len()]).collect();
        for room in along_the_walk(&dungeon) {
            if room == dungeon.way_in.room || room == dungeon.end() {
                continue;
            }
            let found = &dungeon.rooms[room];
            let bank = dungeon.looks[found.look].purposes;
            let taken = bank.rooms.iter().position(|purpose| purpose == found.purpose).unwrap();
            for (nth, purpose) in bank.rooms.iter().enumerate() {
                if purpose.suits(found.shape) {
                    assert!(uses[found.look][nth] >= uses[found.look][taken], "{} before {}", purpose.name, found.name);
                }
            }
            uses[found.look][taken] += 1;
        }
    }
}

#[test]
fn every_name_in_a_dungeon_is_its_own_a_purpose_used_again_taking_a_word_before_it() {
    let mut again = 0;
    for dungeon in every_dungeon(1200) {
        let (mut seen, mut roles): (Vec<&str>, Vec<&str>) = (Vec::new(), Vec::new());
        for room in along_the_walk(&dungeon) {
            let found = &dungeon.rooms[room];
            assert!(!seen.contains(&found.name.as_str()), "{} twice", found.name);
            let before = roles.iter().filter(|&&role| role == found.purpose.role).count();
            roles.push(found.purpose.role);
            let want = match before {
                0 => format!("the {}", found.purpose.name),
                1 => format!("the Old {}", found.purpose.name),
                _ => found.name.clone(),
            };
            assert_eq!(found.name, want);
            assert!(found.name.starts_with("the ") && found.name.ends_with(found.purpose.name));
            again += usize::from(before > 0);
            seen.push(&found.name);
        }
    }
    assert!(again > 100, "{again} names used again");
}

#[test]
fn each_purpose_has_a_role_of_its_own_in_lower_case() {
    let mut roles = Vec::new();
    for style in STYLES {
        let bank = style.purposes;
        assert_eq!(bank.rooms.len(), 6, "{}: six purposes between its way in and its end", style.key);
        for purpose in [bank.way_in].iter().chain(bank.rooms).chain([&bank.end]) {
            let plain = purpose.role.chars().all(|letter| letter.is_ascii_lowercase() || letter == '-');
            assert!(plain && !purpose.role.is_empty(), "{}", purpose.role);
            assert!(!roles.contains(&purpose.role), "{} twice", purpose.role);
            roles.push(purpose.role);
            assert!(!purpose.lays.is_empty(), "{} lays props", purpose.name);
        }
    }
    assert_eq!(roles.len(), 48);
}

#[test]
fn a_mines_gallery_is_a_hewn_rectangle_and_its_stope_a_cave() {
    let (mut galleries, mut stopes) = (0, 0);
    for dungeon in every_dungeon(1200) {
        for room in &dungeon.rooms {
            match room.purpose.role {
                "gallery" => {
                    galleries += 1;
                    assert_eq!(room.shape, Shape::Rectangle);
                }
                "stope" => {
                    stopes += 1;
                    assert_eq!(room.shape, Shape::Cave);
                }
                _ => {}
            }
        }
    }
    assert!(galleries > 50 && stopes > 50, "{galleries} galleries and {stopes} stopes");
}
