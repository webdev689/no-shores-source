//! Regions: a watershed over the distance field splits the walkable surface into well-shaped chunks (rooms, runs of
//! corridor) whose outlines the contours trace. Slivers merge into their largest neighbour, and every part not joined
//! to the largest one, by a walk or a link's climb or drop, is dropped from the walkable surface.

use crate::compact::CompactField;

/// The walkable spans laid out flat: each one's distance, where it lives, its neighbours by flat index, and each
/// column's spans' flat indices.
struct Flat {
    dist: Vec<i32>,
    owner: Vec<(usize, usize)>,
    neighbours: Vec<[Option<usize>; 4]>,
    index_of: Vec<Vec<Option<usize>>>,
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
    let neighbours = owner
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
    Flat { dist, owner, neighbours, index_of }
}

/// The watershed's working state: each flat span's region (0 for none yet).
struct Watershed<'flat> {
    flat: &'flat Flat,
    region: Vec<usize>,
    buffer: Vec<usize>,
    stack: Vec<usize>,
}

impl Watershed<'_> {
    /// Grows the regions into unassigned spans at least `level` from the edge, `rounds` times or until none grows.
    /// Each span takes the neighbouring region whose own distance is least.
    fn expand(&mut self, rounds: Option<usize>, level: i32) {
        let fringe: Vec<usize> =
            (0..self.region.len()).filter(|&at| self.region[at] == 0 && self.flat.dist[at] >= level).collect();
        let mut round = 0;
        while rounds.is_none_or(|rounds| round < rounds) {
            for &at in &fringe {
                if self.region[at] != 0 {
                    self.buffer[at] = 0;
                    continue;
                }
                let mut taken = 0;
                let mut best = i32::MAX;
                for near in self.flat.neighbours[at].iter().flatten() {
                    if self.region[*near] != 0 && self.flat.dist[*near] + 2 < best {
                        best = self.flat.dist[*near] + 2;
                        taken = self.region[*near];
                    }
                }
                self.buffer[at] = taken;
            }
            let mut changed = false;
            for &at in &fringe {
                if self.region[at] == 0 && self.buffer[at] != 0 {
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
    /// two regions keep a one-span seam that the next expansion fills. Answers whether any span was taken.
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
                if self.region[near] == 0 && self.flat.dist[near] >= lowest {
                    self.region[near] = region;
                    self.stack.push(near);
                }
            }
        }
        count > 0
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

/// Partitions the walkable surface into regions, writing each span's region (1 up, 0 for none) and clearing
/// `walkable` on every span dropped. The spans each of `joins` names, (column, index), are joined as a walk joins
/// them, so a floor a link reaches is kept.
pub(crate) fn partition(field: &mut CompactField, joins: &[[(usize, usize); 2]]) {
    let cell = field.grid.cell;
    let merge_area = (2.0 / (cell * cell)).round() as i64;
    let min_component = (4.0 / (cell * cell)).round() as i64;
    let flat = flatten(field);
    let count_spans = flat.dist.len();
    let mut shed = Watershed { flat: &flat, region: vec![0; count_spans], buffer: vec![0; count_spans], stack: vec![] };
    let max_dist = flat.dist.iter().copied().max().unwrap_or(0).max(0);
    let mut level = (max_dist + 1) & !1;
    let mut next_region = 1;
    while level > 0 {
        level = if level >= 2 { level - 2 } else { 0 };
        shed.expand(Some(8), level);
        for at in 0..count_spans {
            if shed.region[at] == 0 && flat.dist[at] >= level && shed.flood(at, level, next_region) {
                next_region += 1;
            }
        }
    }
    shed.expand(None, 0);
    let region = shed.region;
    let regions = next_region;

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
            if other != own && count[other] > best_count {
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
    let largest = (1..component_area.len())
        .fold(0, |largest, at| if component_area[at] > component_area[largest] { at } else { largest });
    let mut culled = vec![false; regions];
    for first in 1..regions {
        let own = resolve(&remap, first);
        if count[own] > 0 {
            let kept = component[own] == Some(largest) && component_area[largest] >= min_component;
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
