use super::*;
use crate::solids::Material;
use std::collections::HashMap;

/// One of each rock, at its size in the Test Ground's row of them (client/src/testground/rockRow.ts).
fn every_rock() -> [Solid; 4] {
    [
        Solid::upright(Shape::CaveRoof { seed: 11 }, [40.0, -10.0, 3.5], [14.0, 12.0, 2.5], Material::Rubble),
        Solid::upright(Shape::Overhang { seed: 12 }, [60.0, -10.0, 0.0], [10.0, 7.0, 6.0], Material::Rubble),
        Solid::upright(Shape::RockArch { seed: 13 }, [80.0, -10.0, 0.0], [12.0, 5.0, 10.0], Material::Rubble),
        Solid::upright(Shape::TunnelMouth { seed: 14 }, [100.0, -10.0, 0.0], [12.0, 8.0, 9.0], Material::Rubble),
    ]
}

#[test]
fn every_rock_is_closed_and_wound_out() {
    for solid in every_rock() {
        let rock = mesh(solid.shape, solid.size);
        assert!(rock.triangles.len() > 100, "{:?} has {} triangles", solid.shape, rock.triangles.len());
        // Each edge is walked once each way by the two triangles either side of it, and no other.
        let mut edges: HashMap<(u32, u32), u32> = HashMap::new();
        for &[first, second, third] in &rock.triangles {
            for edge in [(first, second), (second, third), (third, first)] {
                *edges.entry(edge).or_default() += 1;
            }
        }
        for (&(from, to), &count) in &edges {
            assert_eq!(count, 1, "{:?}: edge {from}-{to} is walked {count} times", solid.shape);
            assert_eq!(edges.get(&(to, from)), Some(&1), "{:?}: edge {from}-{to} has no other side", solid.shape);
        }
        // Wound out: the volume each part's lump encloses comes out positive.
        let volume: f64 = rock
            .triangles
            .iter()
            .map(|&[first, second, third]| {
                let ([ax, ay, az], [bx, by, bz], [cx, cy, cz]) =
                    (rock.positions[first as usize], rock.positions[second as usize], rock.positions[third as usize]);
                (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6.0
            })
            .sum();
        let whole = solid.size[0] * solid.size[1] * solid.size[2];
        assert!(volume > 0.2 * whole, "{:?} encloses {volume} of {whole}", solid.shape);
    }
}

#[test]
fn every_rock_drawn_lies_inside_its_boxes_and_each_box_is_filled_close_to_its_faces() {
    let turned = |solid: Solid| Solid { turn: 0.7, lean: 0.05, ..solid };
    for solid in every_rock().into_iter().chain(every_rock().map(turned)) {
        let found = boxes(&solid);
        assert!(!found.is_empty());
        for vertex in mesh(solid.shape, solid.size).positions {
            let [x, y, z] = solid.place(vertex);
            let held = found.iter().any(|&[west, north, east, south, top, bottom]| {
                (west - 1e-9..=east + 1e-9).contains(&x)
                    && (north - 1e-9..=south + 1e-9).contains(&y)
                    && (bottom - 1e-9..=top + 1e-9).contains(&z)
            });
            assert!(held, "{:?}: {vertex:?} is drawn outside every box", solid.shape);
        }
    }
    // Upright, each part's lump reaches within its roughness of every face of its box: the box follows the rock.
    for solid in every_rock() {
        let rock = mesh(solid.shape, solid.size);
        for part in parts(solid.shape, solid.size) {
            for (axis, side) in [(0, 0), (1, 0), (2, 0), (0, 3), (1, 3), (2, 3)] {
                let nearest = rock
                    .positions
                    .iter()
                    .filter(|vertex| {
                        (0..3).all(|at| vertex[at] >= part[at] - 1e-9 && vertex[at] <= part[at + 3] + 1e-9)
                    })
                    .map(|vertex| (vertex[axis] - part[axis + side]).abs())
                    .fold(f64::INFINITY, f64::min);
                assert!(nearest < 0.5, "{:?}: part {part:?} face {axis}/{side} is {nearest} m off", solid.shape);
            }
        }
    }
}

#[test]
fn a_rock_is_its_seed_and_size_alone_and_the_browser_draws_the_same_bits() {
    let [roof, overhang, arch, mouth] = every_rock();
    assert_eq!(mesh(roof.shape, roof.size), mesh(roof.shape, roof.size));
    assert_ne!(mesh(roof.shape, roof.size), mesh(Shape::CaveRoof { seed: 12 }, roof.size));
    // The same fingerprint is pinned in client/src/rules/rockMesh.test.ts, so both draw every vertex alike.
    let print = |solid: Solid| land::exact::fingerprint(mesh(solid.shape, solid.size).positions.into_iter().flatten());
    assert_eq!(print(roof), 4_058_035_614_080_499_008, "the roof's fingerprint");
    assert_eq!(print(overhang), 8_031_344_236_466_977_069, "the overhang's fingerprint");
    assert_eq!(print(arch), 7_852_516_787_465_864_803, "the arch's fingerprint");
    assert_eq!(print(mouth), 12_196_208_482_582_463_808, "the tunnel mouth's fingerprint");
    assert_eq!(land::exact::hash32(&[1, -2, 3]), 171_176_911, "the hash pinned beside them");
}

#[test]
fn a_built_shape_or_a_rock_with_no_size_has_no_rock() {
    assert!(parts(Shape::Block, [4.0, 4.0, 4.0]).is_empty());
    assert!(parts(Shape::Arch { opening: 0.7 }, [4.0, 4.0, 4.0]).is_empty());
    assert_eq!(mesh(Shape::CaveRoof { seed: 1 }, [0.0, 4.0, 4.0]), RockMesh::default(), "no size, no surface");
    assert_eq!(mesh(Shape::CaveRoof { seed: 1 }, [f64::NAN, 4.0, 4.0]), RockMesh::default());
}
