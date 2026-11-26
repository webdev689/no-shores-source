//! The six dungeon styles: the Forge's crypt, halls, cells and temple (the Sanctum), and its cave and mine (the Caverns
//! and the Mines). Each says how many rooms a block holds, the forms its rooms take, their ceilings, its two picture
//! sets, the style a dungeon breaks into on its way down, its rooms' purposes and its entrances.

use crate::banks::{CAVERNS, CELLS, CRYPT, HALLS, MINES, SANCTUM};
use crate::purposes::Bank;
use crate::shapes::{Roof, Shape};

/// One form a style's rooms take: its shape, how often against the style's other forms, and its sides in cells,
/// along its length and across it, each the least and the most. A form is drawn only where its least sides fit.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Form {
    pub shape: Shape,
    pub weight: usize,
    pub along: (usize, usize),
    pub across: (usize, usize),
}

/// A dungeon's style.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Style {
    /// Its name on the wire: crypt, halls, cells, sanctum, caverns or mines.
    pub key: &'static str,
    /// Its name's noun: "The Crypt of the Saltgrass Downs".
    pub noun: &'static str,
    /// How many rooms a block asks for, fewest and most.
    pub rooms: (usize, usize),
    pub forms: &'static [Form],
    /// Its rooms' ceilings' heights, lowest and highest (m), and how they are drawn.
    pub heights: (f64, f64),
    pub roof: Roof,
    /// Its main picture set and its second, by Daggerfall's dungeon archives.
    pub pictures: [u16; 2],
    /// The key of the style its last block may break into, deeper down.
    pub below: &'static str,
    pub purposes: &'static Bank,
    /// The forged entrance models with a door that the rooms may lay for it.
    pub entrances: &'static [u16],
}

const fn form(shape: Shape, weight: usize, along: (usize, usize), across: (usize, usize)) -> Form {
    Form { shape, weight, along, across }
}

/// The two mounds with a door the dungeon blocks stand, and the two cave mouths the ruin blocks stand.
const MOUNDS: &[u16] = &[43601, 43602];
const CAVE_MOUTHS: &[u16] = &[43603, 43604];

/// The six styles, their forms' sides grown by about half for the deeper dungeons. A room four cells or more each
/// way may take a shape a small one cannot.
pub const STYLES: [Style; 6] = [
    Style {
        key: "crypt",
        noun: "Crypt",
        rooms: (3, 5),
        forms: &[
            form(Shape::Rectangle, 3, (2, 6), (2, 6)),
            form(Shape::Octagon, 2, (4, 5), (4, 5)),
            form(Shape::Alcoves, 3, (3, 5), (3, 4)),
        ],
        heights: (3.2, 4.4),
        roof: Roof::Arched,
        pictures: [123, 124],
        below: "caverns",
        purposes: &CRYPT,
        entrances: MOUNDS,
    },
    Style {
        key: "halls",
        noun: "Halls",
        rooms: (2, 4),
        forms: &[
            form(Shape::Rectangle, 4, (3, 10), (3, 10)),
            form(Shape::Ell, 3, (4, 10), (4, 10)),
            form(Shape::Cross, 3, (6, 10), (4, 10)),
        ],
        heights: (4.0, 5.6),
        roof: Roof::Arched,
        pictures: [122, 124],
        below: "crypt",
        purposes: &HALLS,
        entrances: MOUNDS,
    },
    Style {
        key: "cells",
        noun: "Cells",
        rooms: (4, 6),
        forms: &[form(Shape::Rectangle, 3, (2, 3), (2, 3)), form(Shape::Alcoves, 3, (3, 5), (3, 3))],
        heights: (3.2, 3.6),
        roof: Roof::Flat,
        pictures: [122, 123],
        below: "mines",
        purposes: &CELLS,
        entrances: MOUNDS,
    },
    Style {
        key: "sanctum",
        noun: "Sanctum",
        rooms: (2, 4),
        forms: &[
            form(Shape::Rectangle, 3, (3, 10), (3, 10)),
            form(Shape::Ell, 2, (4, 10), (4, 10)),
            form(Shape::Cross, 2, (6, 10), (4, 10)),
            form(Shape::Octagon, 3, (4, 10), (4, 10)),
        ],
        heights: (4.4, 5.6),
        roof: Roof::Arched,
        pictures: [124, 122],
        below: "crypt",
        purposes: &SANCTUM,
        entrances: MOUNDS,
    },
    Style {
        key: "caverns",
        noun: "Caverns",
        rooms: (2, 4),
        forms: &[form(Shape::Rectangle, 1, (3, 6), (3, 6)), form(Shape::Cave, 5, (3, 8), (3, 8))],
        heights: (4.4, 5.6),
        roof: Roof::Rough,
        pictures: [120, 119],
        below: "crypt",
        purposes: &CAVERNS,
        entrances: CAVE_MOUTHS,
    },
    Style {
        key: "mines",
        noun: "Mines",
        rooms: (2, 4),
        // Its galleries are long and two cells wide, its stopes caves.
        forms: &[
            form(Shape::Rectangle, 3, (5, 12), (2, 2)),
            form(Shape::Rectangle, 1, (2, 5), (2, 5)),
            form(Shape::Cave, 3, (3, 8), (3, 8)),
        ],
        heights: (3.2, 4.4),
        roof: Roof::Flat,
        pictures: [119, 120],
        below: "caverns",
        purposes: &MINES,
        entrances: CAVE_MOUTHS,
    },
];

impl Style {
    /// The style its last block breaks into on the way down.
    #[must_use]
    pub fn style_below(&self) -> Style {
        STYLES.into_iter().find(|style| style.key == self.below).unwrap_or(*self)
    }
}
