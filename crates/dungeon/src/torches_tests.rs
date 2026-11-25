use crate::dungeon::EXIT_WIDTH_M;
use crate::torches::{TORCH_APART_M, TORCH_INSET_M, Torch};
use crate::{CELL_M, Dungeon, EVERY_STYLE, SIDES};

fn every_dungeon(count: u32) -> impl Iterator<Item = Dungeon> {
    (0..count)
        .map(|seed| Dungeon::forge(seed.wrapping_mul(2_654_435_761), EVERY_STYLE[seed as usize % EVERY_STYLE.len()]))
}

fn cell_of(dungeon: &Dungeon, torch: &Torch) -> usize {
    (torch.at[0] / CELL_M) as usize + (torch.at[1] / CELL_M) as usize * dungeon.columns
}

#[test]
fn the_portals_torches_stand_either_side_of_it_on_its_wall_past_its_arch_or_on_the_corners_side_wall() {
    for dungeon in every_dungeon(600) {
        let portal = dungeon.portal;
        let [door_x, door_y] = dungeon.portal_door();
        let [dx, dy] = portal.side.unit();
        let [middle_x, middle_y] = dungeon.centre(portal.cell);
        let mut sides = Vec::new();
        for torch in dungeon.torches.iter().filter(|torch| cell_of(&dungeon, torch) == portal.cell) {
            let along = (torch.at[0] - door_x) * -dy + (torch.at[1] - door_y) * dx;
            if torch.wall == portal.side {
                assert!(along.abs() > EXIT_WIDTH_M / 2.0, "beside the portal, not over it");
                // A style's portal arch reaches 1.3 m from its middle and a sconce 0.2 m from its torch.
                assert!(along.abs() >= 1.55 - 1e-9, "clear of the arch: {along}");
                sides.push(along.signum());
            } else if torch.wall != portal.side.opposite() {
                // On the side wall of a corner: its side, by which way that wall lies from the portal's middle.
                let side = torch.wall.unit();
                sides.push(
                    ((torch.at[0] - middle_x) * side[0] + (torch.at[1] - middle_y) * side[1]).signum()
                        * (side[0] * -dy + side[1] * dx).signum(),
                );
            }
        }
        sides.sort_by(f64::total_cmp);
        assert_eq!(sides, [-1.0, 1.0], "one either side, seed's portal at {}", portal.cell);
    }
}

#[test]
fn no_torch_stands_in_a_corner() {
    for dungeon in every_dungeon(600) {
        for torch in &dungeon.torches {
            let cell = cell_of(&dungeon, torch);
            let [x, y] = dungeon.centre(cell);
            for side in SIDES.into_iter().filter(|&side| side != torch.wall && dungeon.rock_beside(cell, side)) {
                let [dx, dy] = side.unit();
                let clear = CELL_M / 2.0 - ((torch.at[0] - x) * dx + (torch.at[1] - y) * dy);
                assert!(clear >= TORCH_INSET_M - 1e-9, "a torch {clear:.2} m from a wall beside its own");
            }
        }
    }
}

#[test]
fn no_two_torches_of_a_room_stand_closer_than_a_pair() {
    for dungeon in every_dungeon(600) {
        for (number, torch) in dungeon.torches.iter().enumerate() {
            let Some(room) = dungeon.room_at(cell_of(&dungeon, torch)) else { continue };
            for other in &dungeon.torches[number + 1..] {
                if dungeon.room_at(cell_of(&dungeon, other)) == Some(room) {
                    let [dx, dy] = [torch.at[0] - other.at[0], torch.at[1] - other.at[1]];
                    let apart = (dx * dx + dy * dy).sqrt();
                    assert!(apart >= TORCH_APART_M - 1e-9, "two torches of room {room} {apart:.2} m apart");
                }
            }
        }
    }
}

#[test]
fn most_portals_stand_on_a_wall_that_runs_on_past_their_cell_both_ways() {
    let (mut whole, mut count) = (0, 0);
    for dungeon in every_dungeon(600) {
        let portal = dungeon.portal;
        count += 1;
        let alongs = [portal.side.clockwise(), portal.side.clockwise().opposite()];
        if alongs.into_iter().all(|along| {
            dungeon.beside(portal.cell, along).is_some_and(|next| {
                dungeon.room_at(next) == Some(portal.room) && dungeon.rock_beside(next, portal.side)
            })
        }) {
            whole += 1;
        }
    }
    // The rest are end rooms with no such wall, two cells across or broken by doors: a torch stands on a side wall.
    assert!(whole * 5 >= count * 4, "{whole} of {count}");
}

#[test]
fn a_portal_torch_on_its_wall_stands_where_the_wall_runs_on() {
    let (mut ends, mut sides) = (0, 0);
    for dungeon in every_dungeon(600) {
        let portal = dungeon.portal;
        let [x, y] = dungeon.centre(portal.cell);
        for torch in dungeon.torches.iter().filter(|torch| cell_of(&dungeon, torch) == portal.cell) {
            if torch.wall != portal.side {
                continue;
            }
            sides += 1;
            // The torch stands 1.5 m along: the wall must go on into the cell beside it that way.
            let along = [portal.side.clockwise(), portal.side.clockwise().opposite()].into_iter().find(|along| {
                let [ax, ay] = along.unit();
                (torch.at[0] - x) * ax + (torch.at[1] - y) * ay > 0.0
            });
            let runs_on = along.and_then(|along| dungeon.beside(portal.cell, along)).is_some_and(|next| {
                dungeon.room_at(next) == Some(portal.room) && dungeon.rock_beside(next, portal.side)
            });
            if !runs_on {
                ends += 1;
            }
        }
    }
    assert_eq!(ends, 0, "{ends} of {sides} portal torches hang at the end of their wall");
}
