//! The hub's plants: each tree bed, pot, flower bed and planter its pieces stand is planted with the world's own
//! low-poly plants, which the land's nature draws as its climate's (a tree as one of its trees, a bush as one of its
//! shrubs); the pieces themselves are only the beds, pots and boxes.

use crate::modules::all;
use crate::solids::{Shape, Solid};
use serde::Serialize;

/// What a plant is: a tree, or a bush.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Growth {
    Tree,
    Bush,
}

/// A plant the hub stands: what it is, where its foot stands (east, south, up, metres), its turn (radians clockwise
/// from north) and how much its drawn size is scaled.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Plant {
    pub growth: Growth,
    pub at: [f64; 3],
    pub turn: f64,
    pub scale: f64,
}

/// A planted piece's plants in its own frame (across, toward its front, up from its foot, metres) and their scales.
fn planting(name: &str) -> Vec<(Growth, [f64; 3], f64)> {
    let soil = |growth, x, y, z, scale| (growth, [x, y, z], scale);
    match name {
        // A broad tree in its raised ring bed, bushes round it on the bed's lawn.
        "court-tree" => std::iter::once(soil(Growth::Tree, 0.0, 0.0, 0.5, 1.0))
            .chain((0..6).map(|bush| {
                let angle = std::f64::consts::TAU * f64::from(bush) / 6.0 + 0.3;
                soil(Growth::Bush, libm::cos(angle) * 1.45, libm::sin(angle) * 1.45, 0.5, 0.55)
            }))
            .collect(),
        "potted-tree" => vec![soil(Growth::Tree, 0.0, 0.0, 0.78, 0.3)],
        // A row of bushes along the bed's back, smaller ones along its front.
        "lawn-bed" => [-3.0, -1.5, 0.0, 1.5, 3.0]
            .map(|x| soil(Growth::Bush, x, -0.8, 0.46, 0.6))
            .into_iter()
            .chain([-2.25, -0.75, 0.75, 2.25].map(|x| soil(Growth::Bush, x, 0.6, 0.46, 0.4)))
            .collect(),
        "planter" => vec![soil(Growth::Bush, -0.45, 0.0, 0.66, 0.45), soil(Growth::Bush, 0.45, 0.0, 0.66, 0.45)],
        _ => Vec::new(),
    }
}

/// Every plant of the pieces among `solids`, each turned its own way.
pub(crate) fn plants(solids: &[Solid]) -> Vec<Plant> {
    let modules = all();
    solids
        .iter()
        .filter_map(|solid| match solid.shape {
            Shape::Module { module, group: 0 } => {
                modules.get(module as usize).map(|found| (solid, planting(&found.name)))
            }
            _ => None,
        })
        .flat_map(|(solid, planted)| {
            planted.into_iter().enumerate().map(|(number, (growth, point, scale))| Plant {
                growth,
                at: solid.place(point),
                turn: solid.turn + number as f64 * 1.7,
                scale,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::number_of;

    #[test]
    fn a_planted_piece_stands_its_plants_in_its_soil_turned_with_it() {
        let number = number_of("lawn-bed").expect("the lawn bed is baked");
        let turn = std::f64::consts::FRAC_PI_2;
        let bed = crate::modules::solids(number, [100.0, 200.0, 30.0], turn);
        let planted = plants(&bed);
        assert_eq!(planted.len(), 9);
        assert!(planted.iter().all(|plant| plant.growth == Growth::Bush && (plant.at[2] - 30.46).abs() < 1e-9));
        // Turned a quarter, the bed's length runs south: its plants stand along it, within its reach of the middle.
        assert!(planted.iter().all(|plant| (plant.at[0] - 100.0).abs() <= 0.81 && (plant.at[1] - 200.0).abs() <= 3.01));
        assert!(plants(&crate::modules::solids(number_of("bench").expect("baked"), [0.0; 3], 0.0)).is_empty());
    }
}
