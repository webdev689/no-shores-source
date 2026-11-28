//! Regions: a watershed over the distance field splits the walkable surface into well-shaped chunks (rooms, runs of
//! corridor) whose outlines the contours trace. Slivers merge into their largest neighbour, and every part not joined
//! to the largest one (or to the one under an anchor, when a bake names one), by a walk or a link's climb or drop, is
//! dropped from the walkable surface; over the open sea, where no ground joins the parts, only those too small to
//! stand in are. No region meets itself, flat, where no walk joins it, by growing or merging: where a way winds back
//! over or beside itself, as a dungeon's does up a flight, the floor it comes back to is another region, so every
//! outline stays a plain loop.

use crate::compact::CompactField;

/// The walkable spans laid out flat: each one's distance, where it lives, its neighbours by flat index, each
/// column's spans' flat indices, and the spans apart from each, those of span `at` from `apart_from[at]` on.
struct Flat {
    dist: Vec<i32>,
    owner: Vec<(usize, usize)>,
    neighbours: Vec<[Option<usize>; 4]>,
    index_of: Vec<Vec<Option<usize>>>,
    apart: Vec<usize>,
    apart_from: Vec<usize>,
}

impl Flat {
    /// The spans over, under or beside a span that no walk joins it to: the others of its column, and those of the
    /// columns beside it but the one it links to each way. A region holding a span and one of these would meet
    /// itself, flat, where no walk joins it, as one wound up a flight and back over its own floor does: its outline
    /// would cross or run back along itself, and its corners there, at two heights, weld into one. Most spans, on a
    /// floor with none over or under it, have none.
    fn apart(&self, at: usize) -> &[usize] {
        &self.apart[self.apart_from[at]..self.apart_from[at + 1]]
    }
}

fn flatten(field: &CompactField) -> Flat {
    let mut index_of: Vec<Vec<Option<usize>>> = Vec::with_capacity(field.columns.len());
    let mut owner = Vec::new();
    let mut dist = Vec::new();
    for (column, spans) in field.columns.iter().enumerate() {
        let mut indices = Vec::with_capacity(spans.len());
        for (index, span) in spans.iter().enumerate() {
            if span.walkable {
                indices.push(Some(owner.len()));
                owner.push((column, index));
                dist.push(span.dist);
            } else {
                indices.push(None);
            }
        }
        index_of.push(indices);
    }
    let cells_x = field.grid.cells_x;
    let neighbours: Vec<[Option<usize>; 4]> = owner
        .iter()
        .map(|&(column, index)| {
            let (ix, iy) = (column % cells_x, column / cells_x);
            let mut found = [None; 4];
            for (direction, slot) in found.iter_mut().enumerate() {
                if let Some(link) = field.columns[column][index].links[direction] {
                    let (next_x, next_y, _) = field.linked(ix, iy, direction, link);
                    *slot = index_of[next_x + next_y * cells_x][link];
                }
            }
            found
        })
        .collect();
    let (mut apart, mut apart_from) = (Vec::new(), Vec::with_capacity(owner.len() + 1));
    for (at, &(column, _)) in owner.iter().enumerate() {
        apart_from.push(apart.len());
        let mut keep = |column: usize, joined: Option<usize>| {
            for &other in index_of[column].iter().flatten() {
                if Some(other) != joined {
                    apart.push(other);
                }
            }
        };
        keep(column, Some(at));
        for (direction, &joined) in neighbours[at].iter().enumerate() {
            if let Some((next_x, next_y)) = field.beside(column % cells_x, column / cells_x, direction) {
                keep(next_x + next_y * cells_x, joined);
            }
        }
    }
    apart_from.push(apart.len());
    Flat { dist, owner, neighbours, index_of, apart, apart_from }
}

/// The watershed's working state: each flat span's region (0 for none yet).
struct Watershed<'flat> {
    flat: &'flat Flat,
    region: Vec<usize>,
    buffer: Vec<usize>,
    stack: Vec<usize>,
}

impl Watershed<'_> {
    /// Whether a span over, under or beside a span, unjoined (`Flat::apart`), is already the region's.
    fn holds(&self, at: usize, region: usize) -> bool {
        self.flat.apart(at).iter().any(|&other| self.region[other] == region)
    }

    /// Grows the regions into the unassigned spans of `fringe`, `rounds` times or until none grows. Each span takes
    /// the neighbouring region whose own distance is least, every span of a round at once, so their order is no matter;
    /// never one that holds a span apart from it, and of two spans apart offered one region in a round, the first.
    fn expand(&mut self, fringe: &[usize], rounds: Option<usize>) {
        let mut round = 0;
        while rounds.is_none_or(|rounds| round < rounds) {
            for &at in fringe {
                if self.region[at] != 0 {
                    self.buffer[at] = 0;
                    continue;
                }
                let mut taken = 0;
                let mut best = i32::MAX;
                for near in self.flat.neighbours[at].iter().flatten() {
                    let region = self.region[*near];
                    if region != 0 && self.flat.dist[*near] + 2 < best && !self.holds(at, region) {
                        best = self.flat.dist[*near] + 2;
                        taken = region;
                    }
                }
                self.buffer[at] = taken;
            }
            let mut changed = false;
            for &at in fringe {
                if self.region[at] == 0 && self.buffer[at] != 0 && !self.holds(at, self.buffer[at]) {
                    self.region[at] = self.buffer[at];
                    changed = true;
                }
            }
            if !changed {
                break;
            }
            round += 1;
        }
    }

    /// Floods a new region from a seed at a water level. A span that already touches another region stays out, so
    /// two regions keep a one-span seam that the next expansion fills, and so does one apart from a span the region
    /// already holds. Answers whether any span was taken.
    fn flood(&mut self, seed: usize, level: i32, region: usize) -> bool {
        let lowest = if level >= 2 { level - 2 } else { 0 };
        self.stack.clear();
        self.stack.push(seed);
        self.region[seed] = region;
        let mut count = 0;
        while let Some(at) = self.stack.pop() {
            let neighbours = self.flat.neighbours[at];
            if neighbours.iter().flatten().any(|near| self.region[*near] != 0 && self.region[*near] != region) {
                self.region[at] = 0;
                continue;
            }
            count += 1;
            for near in neighbours.into_iter().flatten() {
                if self.region[near] == 0 && self.flat.dist[near] >= lowest && !self.holds(near, region) {
                    self.region[near] = region;
                    self.stack.push(near);
                }
            }
        }
        count > 0
    }
}

/// The spans a water level reaches, kept between levels: every span, the deepest first (by index where alike); how
/// many of those the levels have reached; and those reached still without a region, by index.
struct Rising {
    deepest: Vec<usize>,
    reached: usize,
    waiting: Vec<usize>,
    merged: Vec<usize>,
}

impl Rising {
    fn new(dist: &[i32]) -> Self {
        let mut deepest: Vec<usize> = (0..dist.len()).collect();
        deepest.sort_by_key(|&at| core::cmp::Reverse(dist[at]));
        Self { deepest, reached: 0, waiting: Vec::new(), merged: Vec::new() }
    }

    /// Every span at least `level` from the edge still without a region, by index: those waiting from the levels
    /// before, and those this one reaches. A span once given a region never loses it, so none else can be.
    fn to(&mut self, level: i32, dist: &[i32], region: &[usize]) -> &[usize] {
        let start = self.reached;
        while self.deepest.get(self.reached).is_some_and(|&at| dist[at] >= level) {
            self.reached += 1;
        }
        let reached = &mut self.deepest[start..self.reached];
        reached.sort_unstable();
        let (mut old, mut new) = (self.waiting.iter().peekable(), reached.iter().peekable());
        self.merged.clear();
        while let Some(&at) = match (old.peek(), new.peek()) {
            (Some(one), Some(other)) => {
                if one < other {
                    old.next()
                } else {
                    new.next()
                }
            }
            (Some(_), None) => old.next(),
            (None, _) => new.next(),
        } {
            if region[at] == 0 {
                self.merged.push(at);
            }
        }
        core::mem::swap(&mut self.waiting, &mut self.merged);
        &self.waiting
    }
}

/// Adds a region to an adjacency list once, keeping the order regions were met in.
fn add_once(list: &mut Vec<usize>, region: usize) {
    if !list.contains(&region) {
        list.push(region);
    }
}

/// Follows merged regions to the one that survives.
fn resolve(remap: &[usize], mut region: usize) -> usize {
    while remap[region] != region {
        region = remap[region];
    }
    region
}

/// The span in a region nearest a world point, its floor's height counted as its across; the first of any as near.
fn anchored_span(field: &CompactField, flat: &Flat, region: &[usize], point: [f64; 3]) -> Option<usize> {
    let grid = &field.grid;
    let apart = |at: usize| {
        let (column, index) = flat.owner[at];
        let (x, y) = grid.centre(column % grid.cells_x, column / grid.cells_x);
        let z = grid.height(field.columns[column][index].floor);
        (x - point[0]) * (x - point[0]) + (y - point[1]) * (y - point[1]) + (z - point[2]) * (z - point[2])
    };
    (0..region.len())
        .filter(|&at| region[at] != 0)
        .fold(None, |best: Option<(usize, f64)>, at| {
            let own = apart(at);
            if best.is_none_or(|(_, nearest)| own < nearest) { Some((at, own)) } else { best }
        })
        .map(|(at, _)| at)
}

/// Partitions the walkable surface into regions, writing each span's region (1 up, 0 for none) and clearing
/// `walkable` on every span dropped: every part neither a walk nor one of `joins` joins to the largest, or to the floor
/// nearest `anchor` when there is one. The spans each of `joins` names, (column, index), are joined as a walk joins
/// them, so a floor a link reaches is kept. With `every_part` each part big enough to stand in is kept, not the
/// largest alone.
pub(crate) fn partition(
    field: &mut CompactField,
    joins: &[[(usize, usize); 2]],
    anchor: Option<[f64; 3]>,
    every_part: bool,
) {
    let cell = field.grid.cell;
    let merge_area = (2.0 / (cell * cell)).round() as i64;
    let min_component = (4.0 / (cell * cell)).round() as i64;
    let flat = flatten(field);
    let count_spans = flat.dist.len();
    let mut shed = Watershed { flat: &flat, region: vec![0; count_spans], buffer: vec![0; count_spans], stack: vec![] };
    let max_dist = flat.dist.iter().copied().max().unwrap_or(0).max(0);
    let mut level = (max_dist + 1) & !1;
    let mut next_region = 1;
    // Each level looks only at the spans it reaches still without a region, in the order a scan of them all would.
    let mut rising = Rising::new(&flat.dist);
    while level > 0 {
        level = if level >= 2 { level - 2 } else { 0 };
        let fringe = rising.to(level, &flat.dist, &shed.region);
        shed.expand(fringe, Some(8));
        for &at in fringe {
            if shed.region[at] == 0 && shed.flood(at, level, next_region) {
                next_region += 1;
            }
        }
    }
    shed.expand(rising.to(0, &flat.dist, &shed.region), None);
    // A span no region beside it may take, as each holds a span apart from it, starts a region of its own, the first
    // by index first.
    loop {
        let left = rising.to(0, &flat.dist, &shed.region);
        let Some(&seed) = left.first() else { break };
        shed.region[seed] = next_region;
        next_region += 1;
        shed.expand(left, None);
    }
    let region = shed.region;
    let regions = next_region;

    // The regions over, under or beside each where no walk joins them: two of them merged would meet themselves.
    let mut apart: Vec<Vec<usize>> = vec![Vec::new(); regions];
    for at in 0..count_spans {
        for &other in flat.apart(at) {
            let (one, other) = (region[at], region[other]);
            if one != 0 && other != 0 && one != other {
                add_once(&mut apart[one], other);
                add_once(&mut apart[other], one);
            }
        }
    }
    let mut count = vec![0_i64; regions];
    let mut adjacent: Vec<Vec<usize>> = vec![Vec::new(); regions];
    for at in 0..count_spans {
        let own = region[at];
        if own == 0 {
            continue;
        }
        count[own] += 1;
        for &near in flat.neighbours[at].iter().flatten() {
            if region[near] != 0 && region[near] != own {
                add_once(&mut adjacent[own], region[near]);
            } else if region[near] == 0 {
                // A seam span can be the whole bottleneck between two regions: they meet through it.
                for &beyond in flat.neighbours[near].iter().flatten() {
                    if region[beyond] != 0 && region[beyond] != own {
                        add_once(&mut adjacent[own], region[beyond]);
                    }
                }
            }
        }
    }

    let mut remap: Vec<usize> = (0..regions).collect();
    let mut by_size: Vec<usize> = (1..regions).collect();
    by_size.sort_by_key(|&region| count[region]);
    for first in by_size {
        let own = resolve(&remap, first);
        if own == 0 || count[own] >= merge_area || count[own] == 0 {
            continue;
        }
        let mut best = 0;
        let mut best_count = -1;
        for &other in &adjacent[own] {
            let other = resolve(&remap, other);
            let meets = apart[own].iter().any(|&away| resolve(&remap, away) == other);
            if other != own && count[other] > best_count && !meets {
                best_count = count[other];
                best = other;
            }
        }
        if best == 0 {
            continue;
        }
        remap[own] = best;
        count[best] += count[own];
        count[own] = 0;
        for away in apart[own].clone() {
            let away = resolve(&remap, away);
            add_once(&mut apart[best], away);
            add_once(&mut apart[away], best);
        }
        for other in adjacent[own].clone() {
            let other = resolve(&remap, other);
            if other != best {
                add_once(&mut adjacent[best], other);
                add_once(&mut adjacent[other], best);
            }
        }
    }

    // A link joins two floors only once slivers have merged: no top merges into the ground beside it.
    let mut joined = adjacent;
    for [one, other] in joins {
        let region_of = |(column, index): (usize, usize)| flat.index_of[column][index].map(|at| region[at]);
        let (Some(one), Some(other)) = (region_of(*one), region_of(*other)) else { continue };
        let (one, other) = (resolve(&remap, one), resolve(&remap, other));
        if one != 0 && other != 0 && one != other {
            add_once(&mut joined[one], other);
            add_once(&mut joined[other], one);
        }
    }
    let (component, component_area) = components(&remap, &count, &joined);
    let anchored = anchor.and_then(|point| anchored_span(field, &flat, &region, point));
    let largest = anchored.and_then(|at| component[resolve(&remap, region[at])]).unwrap_or_else(|| {
        (1..component_area.len())
            .fold(0, |largest, at| if component_area[at] > component_area[largest] { at } else { largest })
    });
    let mut culled = vec![false; regions];
    for first in 1..regions {
        let own = resolve(&remap, first);
        if count[own] > 0 {
            let kept = component[own]
                .is_some_and(|part| (every_part || part == largest) && component_area[part] >= min_component);
            culled[own] = !kept;
        }
    }

    let mut final_id = vec![0; regions];
    let mut kept = 0;
    for first in 1..regions {
        let own = resolve(&remap, first);
        if count[own] > 0 && !culled[own] && final_id[own] == 0 {
            kept += 1;
            final_id[own] = kept;
        }
    }
    for (at, &(column, index)) in flat.owner.iter().enumerate() {
        let own = resolve(&remap, region[at]);
        let span = &mut field.columns[column][index];
        if own == 0 || culled[own] {
            span.walkable = false;
            span.region = 0;
        } else {
            span.region = final_id[own];
        }
    }
}

/// The connected components of the merged region graph: each surviving region's component, and each component's
/// area in spans.
fn components(remap: &[usize], count: &[i64], adjacent: &[Vec<usize>]) -> (Vec<Option<usize>>, Vec<i64>) {
    let mut component = vec![None; count.len()];
    let mut area_of = Vec::new();
    for first in 1..count.len() {
        let own = resolve(remap, first);
        if count[own] == 0 || component[own].is_some() {
            continue;
        }
        let id = area_of.len();
        component[own] = Some(id);
        let mut queue = vec![own];
        let mut area = 0;
        while let Some(region) = queue.pop() {
            area += count[region];
            for &other in &adjacent[region] {
                let other = resolve(remap, other);
                if count[other] > 0 && component[other].is_none() {
                    component[other] = Some(id);
                    queue.push(other);
                }
            }
        }
        area_of.push(area);
    }
    (component, area_of)
}

#[cfg(test)]
#[path = "regions_tests.rs"]
mod regions_tests;
