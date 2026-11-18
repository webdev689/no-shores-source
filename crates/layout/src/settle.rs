//! A landmass's layouts, planned for every node it draws and laid on its ground: each patrol area with gates to the
//! instances of its side (the mission, dungeon and boss nodes nearest it), each instance entered from that patrol
//! area. Their sculpts carve the land, the buildings' seats become pads and the paths roads, so every later reading
//! of the ground (a node's window, the browser's land, nature keeping off the paths) stands on them; then what is
//! laid on the land (a block's streets, the paths) takes its heights from the ground as it now lies.

use crate::book::Book;
use crate::brief::Briefs;
use crate::collide::boxes_of;
use crate::{Layout, Link, middle_of, plan};
use land::landmass::Landmass;
use land::pads::{Pad, Pads};
use land::sculpts::Sculpts;
use land::sites::{Node, NodeKind};
use std::collections::BTreeMap;

/// The longest step between two of a path's points as it is laid on the ground, metres.
const PATH_STEP_M: f64 = 8.0;

/// Which nodes each node's layout links to: a patrol area to the instances nearer it than any other patrol area, an
/// instance to that patrol area. With no patrol area, nothing links.
#[must_use]
pub fn links_of(nodes: &[Node]) -> BTreeMap<String, Vec<Link>> {
    let patrols: Vec<&Node> = nodes.iter().filter(|node| node.kind == NodeKind::Patrol).collect();
    let square = |from: [f64; 2], to: [f64; 2]| (to[0] - from[0]) * (to[0] - from[0]) + (to[1] - from[1]) * (to[1] - from[1]);
    let mut links: BTreeMap<String, Vec<Link>> = BTreeMap::new();
    for node in nodes.iter().filter(|node| !matches!(node.kind, NodeKind::Patrol | NodeKind::Social)) {
        let middle = middle_of(node);
        let nearest = patrols.iter().min_by(|first, second| {
            square(middle_of(first), middle).total_cmp(&square(middle_of(second), middle)).then(first.id.cmp(&second.id))
        });
        if let Some(patrol) = nearest {
            links.entry(node.id.clone()).or_default().push(Link { id: patrol.id.clone(), towards: middle_of(patrol) });
            links.entry(patrol.id.clone()).or_default().push(Link { id: node.id.clone(), towards: middle });
        }
    }
    links
}

/// A line with a point at least every `step` metres along it.
fn dense(points: &[[f64; 2]], step: f64) -> Vec<(f64, f64)> {
    let mut out = Vec::new();
    for pair in points.windows(2) {
        let length = crate::field::distance(pair[0], pair[1]);
        let steps = (length / step).ceil().max(1.0) as usize;
        for at in 0..steps {
            let along = at as f64 / steps as f64;
            out.push((pair[0][0] + (pair[1][0] - pair[0][0]) * along, pair[0][1] + (pair[1][1] - pair[0][1]) * along));
        }
    }
    out.extend(points.last().map(|&[x, y]| (x, y)));
    out
}

/// Plans every drawn node's layout on a landmass whose city is already settled, and lays them on its ground.
#[must_use]
pub fn settle(landmass: &mut Landmass, book: &Book, briefs: &Briefs) -> Vec<Layout> {
    let nodes: Vec<Node> = landmass.edits.nodes.iter().filter(|node| node.kind != NodeKind::Social).cloned().collect();
    let links = links_of(&nodes);
    let rise = crate::carve::rise_of(landmass.biome.map(|biome| biome.key));
    let mut layouts: Vec<Layout> = nodes
        .iter()
        .map(|node| {
            let linked = links.get(&node.id).map_or(&[][..], Vec::as_slice);
            plan(node, &landmass.surface, &briefs.of(&node.id, node.kind), linked, book, rise)
        })
        .collect();
    landmass.surface.sculpts = Sculpts::from(layouts.iter().map(|layout| layout.sculpt.clone()).collect::<Vec<_>>());
    let mut pads: Vec<Pad> = landmass.surface.pads.clone().into();
    pads.extend(layouts.iter().flat_map(|layout| layout.seating.pads.iter().copied()));
    landmass.surface.pads = Pads::from(pads);
    let roads: Vec<(Vec<(f64, f64)>, f64)> = layouts
        .iter()
        .flat_map(|layout| layout.paths.iter().map(|path| (dense(&path.points, PATH_STEP_M), path.tier.width())))
        .collect();
    landmass.surface.add_roads(&roads);
    let ground = &landmass.surface;
    for layout in &mut layouts {
        for path in &mut layout.paths {
            path.heights = path.points.iter().map(|&[x, y]| ground.height_at(x, y)).collect();
        }
        for tile in &mut layout.seating.tiles {
            let half = crate::seat::TILE_M / 2.0;
            let [x, y] = tile.at;
            tile.corners = [[x - half, y - half], [x + half, y - half], [x + half, y + half], [x - half, y + half]]
                .map(|[corner_x, corner_y]| ground.height_at(corner_x, corner_y));
        }
        layout.boxes = boxes_of(layout, book);
    }
    layouts
}

#[cfg(test)]
mod tests {
    use super::*;
    use world::geometry::Point;

    fn node(id: &str, kind: NodeKind, x: i64) -> Node {
        let ring = vec![Point { x, y: 0 }, Point { x: x + 100, y: 0 }, Point { x: x + 100, y: 100 }, Point { x, y: 100 }];
        Node { id: id.into(), kind, name: id.into(), ring, spawns: vec![Point { x: x + 50, y: 50 }] }
    }

    #[test]
    fn instances_link_to_their_nearest_patrol_area_and_it_to_them() {
        let nodes = [
            node("west", NodeKind::Patrol, 0),
            node("east", NodeKind::Patrol, 10_000),
            node("mill", NodeKind::Mission, 1_000),
            node("tomb", NodeKind::Dungeon, 9_000),
        ];
        let links = links_of(&nodes);
        assert_eq!(links["mill"][0].id, "west");
        assert_eq!(links["tomb"][0].id, "east");
        assert_eq!(links["west"].iter().map(|link| link.id.as_str()).collect::<Vec<_>>(), ["mill"]);
    }

    #[test]
    fn a_line_is_laid_with_a_point_every_few_metres() {
        let points = dense(&[[0.0, 0.0], [10.0, 0.0]], 4.0);
        assert_eq!(points.len(), 4);
        assert_eq!(points.last(), Some(&(10.0, 0.0)));
    }
}
