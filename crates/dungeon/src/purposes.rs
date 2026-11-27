//! What each room is for: its purpose, drawn from its block style's bank, and its name. The way in's room and the end
//! room take their style's own; every other room draws one its shape suits among those used least in the dungeon, so
//! none is used twice while one is left unused. A purpose says which props its room lays and where, and which lights
//! burn in it.

use crate::Dungeon;
use crate::fixtures::Kind;
use crate::lane::Lane;
use crate::models::PropModel;
use crate::shapes::Shape;

/// Where a lay stands its pieces in a room.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pattern {
    /// Against its rock walls, one for each `per` of its cells and at least one.
    Walls { per: usize },
    /// One, free-standing on the cell nearest its middle, its front to the way it is entered.
    Middle,
    /// In rows along its longer side, on every second line from the second, the ends of each line left as aisles.
    Rows { facing: Facing },
    /// A pair against one wall, one either side of the end's door or the way on.
    Flank,
    /// One in each alcove, a cell with rock on three sides, against its back.
    Alcoves,
    /// Scattered free-standing over its floor, one for each `per` of its cells and at least one.
    Rubble { per: usize },
    /// Hung over head height on its walls, one for each `per` of its cells and at least one.
    Hung { per: usize },
}

/// Which way the pieces of a row face: along the row, away from where the room is entered, as pews face an altar; or
/// across it, as shelves face an aisle.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Facing {
    Along,
    Across,
}

/// A lay: its pattern and the families its pieces are drawn from, a family first and then a piece of it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Lay {
    pub pattern: Pattern,
    pub families: &'static [&'static [PropModel]],
}

/// Where a light that is not a torch burns in a room.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lit {
    /// A pair either side of the end's door or the way on, as a Flank of props.
    Flank,
    /// One on the free cell nearest the middle.
    Middle,
    /// Against or on its walls, one for each `per` of its cells and at least one.
    Walls { per: usize },
    /// On the tops of its tables, lecterns, altars and coffins, `most` at most.
    Tops { most: usize },
    /// In each of its hearths.
    Hearths,
    /// On each of its posts.
    Posts,
}

/// A kind of light and where it burns.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Light {
    pub kind: Kind,
    pub lit: Lit,
}

/// The braziers flanking the doorway the main way leaves a room by, whatever its purpose.
pub(crate) const WAY_ON: Light = Light { kind: Kind::Brazier, lit: Lit::Flank };

/// A room's purpose: its key on the wire, its name, the shapes it suits (any where none are named), its props and its
/// lights.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Purpose {
    pub role: &'static str,
    pub name: &'static str,
    pub shapes: &'static [Shape],
    pub lays: &'static [Lay],
    pub lights: &'static [Light],
}

/// A style's purposes: its way in's room, its other rooms, and its end room.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Bank {
    pub way_in: Purpose,
    pub rooms: &'static [Purpose],
    pub end: Purpose,
}

/// The words a name takes before it when it is used again: "the Old Ossuary". A dungeon has twenty rooms at most,
/// eighteen of them drawn, and a shape suits five of a bank's six purposes at least, so none is used past a fourth time.
const AGAIN: [&str; 6] = ["Old", "Lower", "Far", "Hidden", "Silent", "Forgotten"];

/// A purpose's name the `times`-th time it is used in a dungeon, from 0.
fn named(name: &str, times: usize) -> String {
    match times.checked_sub(1) {
        None => format!("the {name}"),
        Some(again) => format!("the {} {name}", AGAIN[again.min(AGAIN.len() - 1)]),
    }
}

impl Purpose {
    /// Whether a room of `shape` suits it.
    #[must_use]
    pub fn suits(&self, shape: Shape) -> bool {
        self.shapes.is_empty() || self.shapes.contains(&shape)
    }
}

impl Dungeon {
    /// Gives each room its purpose, room after room along the walk from the way in, each look's draws on a lane of its
    /// own: the purposes its shape suits that its look's other rooms have taken least, one drawn.
    pub(crate) fn name_rooms(&mut self, seed: u32) {
        let mut order: Vec<usize> = (0..self.rooms.len()).collect();
        order.sort_by_key(|&room| (self.rooms[room].walk, room));
        let mut lanes: Vec<Lane> =
            (0..self.looks.len()).map(|look| Lane::named(&format!("purposes:{seed}:{look}"))).collect();
        let mut uses: Vec<Vec<usize>> = self.looks.iter().map(|look| vec![0; look.purposes.rooms.len()]).collect();
        for room in order {
            let (look, shape) = (self.rooms[room].look, self.rooms[room].shape);
            let bank = self.looks[look].purposes;
            let purpose = if room == self.way_in.room {
                &self.looks[0].purposes.way_in
            } else if room == self.end {
                &bank.end
            } else {
                let suited: Vec<usize> = (0..bank.rooms.len()).filter(|&nth| bank.rooms[nth].suits(shape)).collect();
                let least = suited.iter().map(|&nth| uses[look][nth]).min().unwrap_or(0);
                let open: Vec<usize> = suited.into_iter().filter(|&nth| uses[look][nth] == least).collect();
                let Some(&nth) = open.get(lanes[look].below(open.len())) else { continue };
                uses[look][nth] += 1;
                &bank.rooms[nth]
            };
            self.rooms[room].purpose = purpose;
        }
    }

    /// Gives each room its role and name, along the walk from the way in: its landmark's where one stands in it, else
    /// its purpose's; a name taken again takes a word before it.
    pub(crate) fn give_names(&mut self) {
        let mut order: Vec<usize> = (0..self.rooms.len()).collect();
        order.sort_by_key(|&room| (self.rooms[room].walk, room));
        let mut names: Vec<&'static str> = Vec::new();
        for room in order {
            let purpose = self.rooms[room].purpose;
            let (role, name) = match self.landmarks.iter().find(|placed| placed.room == room) {
                Some(placed) => {
                    let landmark = placed.landmark;
                    (landmark.role, landmark.name.strip_prefix("the ").unwrap_or(landmark.name))
                }
                None => (purpose.role, purpose.name),
            };
            let times = names.iter().filter(|&&taken| taken == name).count();
            names.push(name);
            self.rooms[room].role = role;
            self.rooms[room].name = named(name, times);
        }
    }
}
