//! Obstacles: circles laid over the baked mesh at run time, a big foe's body or a corpse, that block every poly they
//! touch without touching the bake. Each change bumps an epoch, so a foe holding a path knows to ask again.

use crate::locate::Mesh;

/// An obstacle's name, chosen by whoever adds it.
pub type ObstacleId = u32;

/// One obstacle, in grid units.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Circle {
    x: f64,
    y: f64,
    radius: f64,
}

/// The obstacles in the order they were first added, and which one blocks each poly.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Obstacles {
    list: Vec<(ObstacleId, Circle)>,
    pub blocked: Vec<Option<ObstacleId>>,
    pub epoch: u64,
}

impl Obstacles {
    /// None yet, over a mesh of `polys` polys.
    pub fn new(polys: usize) -> Self {
        Self { list: Vec::new(), blocked: vec![None; polys], epoch: 0 }
    }

    pub fn is_empty(&self) -> bool {
        self.list.is_empty()
    }

    /// Adds an obstacle, or moves one already there (it keeps its place in the order).
    pub fn add(&mut self, mesh: &Mesh, id: ObstacleId, x: f64, y: f64, radius: f64) {
        let circle = Circle { x, y, radius };
        match self.list.iter_mut().find(|(existing, _)| *existing == id) {
            Some(entry) => entry.1 = circle,
            None => self.list.push((id, circle)),
        }
        self.changed(mesh);
    }

    pub fn remove(&mut self, mesh: &Mesh, id: ObstacleId) {
        let before = self.list.len();
        self.list.retain(|(existing, _)| *existing != id);
        if self.list.len() != before {
            self.changed(mesh);
        }
    }

    /// Marks every poly an obstacle's disc touches: a corner or edge within its radius, or its centre inside the
    /// poly. Where two overlap, the later one names the poly.
    fn changed(&mut self, mesh: &Mesh) {
        self.epoch += 1;
        self.blocked = vec![None; mesh.polys.len()];
        for &(id, circle) in &self.list {
            let radius_sq = circle.radius * circle.radius;
            for (poly, blocked) in self.blocked.iter_mut().enumerate() {
                let count = mesh.polys[poly].corners.len();
                let mut hit = false;
                let mut inside = true;
                for at in 0..count {
                    let (a, b) = (mesh.corner(poly, at), mesh.corner(poly, at + 1));
                    if (b.0 - a.0) * (circle.y - a.1) - (circle.x - a.0) * (b.1 - a.1) < 0.0 {
                        inside = false;
                    }
                    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
                    let length_sq = dx * dx + dy * dy;
                    let t = if length_sq > 0.0 {
                        (((circle.x - a.0) * dx + (circle.y - a.1) * dy) / length_sq).clamp(0.0, 1.0)
                    } else {
                        0.0
                    };
                    let (off_x, off_y) = (circle.x - (a.0 + t * dx), circle.y - (a.1 + t * dy));
                    if off_x * off_x + off_y * off_y <= radius_sq {
                        hit = true;
                        break;
                    }
                }
                if hit || inside {
                    *blocked = Some(id);
                }
            }
        }
    }
}
