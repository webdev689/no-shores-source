//! A navmesh baked a slice at a time, for a room that must not spend a whole bake in one tick (some 150 ms over a
//! patrol's ground): a band of the ground's rows sampled a slice, then the solid voxelised, its open field, that
//! eroded, the links tried a few at a slice, the regions, the firing spots, the outlines, and the polys: each slice
//! some 15 ms at most natively. Every slice does the same work in the same order as a bake at once, so the mesh is
//! the same to the bit, however many ticks it is spread over.

use crate::collider::Collider;
use crate::compact::{self, CompactField};
use crate::contours::{self, Contour};
use crate::links::{self, Link, Linking};
use crate::raster::{self, Heightfield};
use crate::{Agent, Bounds, NavMesh, OverSea, Spot, poly, regions, spots};
use movement::{Block, Flat, Heights, Terrain};

/// Rows of the ground a slice samples: a node's 70 m square at 0.25 m cells has 280, so some two dozen slices.
const SAMPLE_ROWS: usize = 12;
/// The ticks a slice steps a body in all, trying links: some 2 ms of them natively.
const LINK_TICKS: u32 = 6000;

/// A bake under way: its course, its bounds and its body, and how far it has come.
#[derive(Debug)]
pub struct Baking {
    colliders: Vec<Collider>,
    bounds: Bounds,
    agent: Agent,
    anchor: Option<[f64; 3]>,
    climbed: bool,
    over_sea: bool,
    stage: Stage,
}

/// What a bake holds between its slices: the ground once sampled (none on open ground or the sea), then the open
/// field, and what each stage has made of it.
#[derive(Debug)]
enum Stage {
    /// The ground's height at each cell's middle, `rows` rows of them so far.
    Sampling {
        heights: Vec<Option<f64>>,
        rows: usize,
    },
    Voxelising {
        ground: Option<Heights>,
    },
    Opening {
        ground: Option<Heights>,
        solid: Box<Heightfield>,
    },
    Eroding {
        ground: Option<Heights>,
        field: Box<CompactField>,
    },
    Linking {
        ground: Option<Heights>,
        field: Box<CompactField>,
        linking: Linking,
    },
    Partitioning {
        ground: Option<Heights>,
        field: Box<CompactField>,
        links: Vec<Link>,
    },
    Spotting {
        ground: Option<Heights>,
        field: Box<CompactField>,
        links: Vec<Link>,
    },
    Outlining {
        ground: Option<Heights>,
        field: Box<CompactField>,
        found: (Vec<Spot>, Vec<Link>),
    },
    Laying {
        ground: Option<Heights>,
        field: Box<CompactField>,
        found: (Vec<Spot>, Vec<Link>),
        outlines: Vec<Contour>,
    },
    Done,
}

impl Baking {
    /// `NavMesh::bake_on`'s bake, a slice at a time: the ground is the terrain each `step` is handed.
    #[must_use]
    pub fn on(blocks: &[Block], bounds: Bounds, agent: &Agent) -> Self {
        Self::of(colliders(blocks), bounds, agent, (None, true), false, sampling())
    }

    /// `NavMesh::bake`'s, on open ground at 0.
    #[must_use]
    pub fn flat(blocks: &[Block], bounds: Bounds, agent: &Agent) -> Self {
        Self::of(colliders(blocks), bounds, agent, (None, true), false, Stage::Voxelising { ground: None })
    }

    /// `NavMesh::bake_over_sea`'s.
    #[must_use]
    pub fn over_sea(blocks: &[Block], bounds: Bounds, agent: &Agent) -> Self {
        Self::of(colliders(blocks), bounds, agent, (None, true), true, Stage::Voxelising { ground: None })
    }

    /// `NavMesh::bake_anchored`'s.
    pub(crate) fn anchored(blocks: &[Block], bounds: Bounds, agent: &Agent, anchor: [f64; 3]) -> Self {
        Self::of(colliders(blocks), bounds, agent, (Some(anchor), false), false, sampling())
    }

    /// `NavMesh::bake_colliders`'s.
    pub(crate) fn colliders(colliders: &[Collider], bounds: Bounds, agent: &Agent) -> Self {
        Self::of(colliders.to_vec(), bounds, agent, (None, true), false, Stage::Voxelising { ground: None })
    }

    fn of(
        colliders: Vec<Collider>,
        bounds: Bounds,
        agent: &Agent,
        (anchor, climbed): (Option<[f64; 3]>, bool),
        over_sea: bool,
        stage: Stage,
    ) -> Self {
        Self { colliders, bounds, agent: *agent, anchor, climbed, over_sea, stage }
    }

    /// Does the next slice of the bake, the ground read from `ground` while it is sampled; the mesh once it is whole,
    /// after which it answers none.
    pub fn step(&mut self, ground: &dyn Terrain) -> Option<NavMesh> {
        let (bounds, agent) = (self.bounds, self.agent);
        self.stage = match core::mem::replace(&mut self.stage, Stage::Done) {
            Stage::Sampling { mut heights, rows } => {
                let more = rows + SAMPLE_ROWS;
                raster::sample_rows(ground, bounds, &agent, rows..more, &mut heights);
                if more < raster::rows(bounds, &agent) {
                    Stage::Sampling { heights, rows: more }
                } else {
                    Stage::Voxelising { ground: raster::sampled(bounds, &agent, heights) }
                }
            }
            Stage::Voxelising { ground } => {
                let walks = !self.over_sea;
                let solid = Box::new(raster::voxelise(&self.colliders, self.floor(&ground), bounds, &agent, walks));
                Stage::Opening { ground, solid }
            }
            // The solid is let go of once the open surface is built: the two at once would double the bake's memory.
            Stage::Opening { ground, solid } => {
                Stage::Eroding { ground, field: Box::new(compact::open(&solid, &agent)) }
            }
            Stage::Eroding { ground, mut field } => {
                compact::erode(&mut field, &agent);
                Stage::Linking { ground, field, linking: Linking::new(&self.colliders) }
            }
            Stage::Linking { ground, field, mut linking } => {
                if !self.climbed {
                    Stage::Partitioning { ground, field, links: Vec::new() }
                } else if linking.step(self.floor(&ground), LINK_TICKS) {
                    Stage::Partitioning { ground, field, links: linking.links() }
                } else {
                    Stage::Linking { ground, field, linking }
                }
            }
            Stage::Partitioning { ground, mut field, links } => {
                let joins = links::joins(&field, &links);
                regions::partition(&mut field, &joins, self.anchor, self.over_sea);
                Stage::Spotting { ground, field, links }
            }
            Stage::Spotting { ground, field, links } => {
                let spots = spots::bake(&field, &self.colliders, ground.as_ref(), self.floor(&ground), bounds);
                Stage::Outlining { ground, field, found: (spots, links) }
            }
            Stage::Outlining { ground, field, found } => {
                let outlines = contours::build(&field);
                Stage::Laying { ground, field, found, outlines }
            }
            Stage::Laying { ground, field, found, outlines } => {
                let grid = field.grid;
                let polys = poly::build(&outlines, grid.cell, grid.voxel);
                return Some(NavMesh::assembled(&self.colliders, ground, grid, polys, found, self.over_sea));
            }
            Stage::Done => Stage::Done,
        };
        None
    }

    /// The bake's every slice at once.
    #[must_use]
    pub fn finish(mut self, ground: &dyn Terrain) -> NavMesh {
        loop {
            if let Some(mesh) = self.step(ground) {
                return mesh;
            }
        }
    }

    /// The floor the course stands on: the ground sampled, else the sea or open ground at 0.
    fn floor<'floor>(&self, ground: &'floor Option<Heights>) -> &'floor dyn Terrain {
        match ground {
            Some(heights) => heights,
            None if self.over_sea => &OverSea,
            None => &Flat,
        }
    }
}

const fn sampling() -> Stage {
    Stage::Sampling { heights: Vec::new(), rows: 0 }
}

fn colliders(blocks: &[Block]) -> Vec<Collider> {
    blocks.iter().copied().map(Collider::from).collect()
}
