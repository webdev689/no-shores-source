//! A landmass's layouts, planned for every node it draws and laid on its ground: each patrol area with gates to the
//! instances of its side (the mission, dungeon and boss nodes nearest it), each instance entered from that patrol
//! area. Their sculpts carve the land, the buildings' seats become pads and the paths roads, so every later reading
//! of the ground (a node's window, the browser's land, nature keeping off the paths) stands on them; then what is
//! laid on the land (a block's streets, the paths) takes its heights from the ground as it now lies.

use crate::book::Book;
use crate::brief::Briefs;
use crate::collide::boxes_of;
use crate::seat::Seating;
use crate::{Layout, Link, middle_of, plan};
use land::landmass::Landmass;
use land::pads::{Pad, Pads};
use land::sculpts::Sculpts;
use land::sites::{Node, NodeKind};
use std::collections::BTreeMap;

/// The longest step between two of a path's points as it is laid on the ground, metres.
const PATH_STEP_M: f64 = 8.0;
/// How far a solid's base may stand under the ground it was planned on and still stand on it: the deepest a stone
/// or a footing is sunk, metres.
const SUNK_AT_MOST_M: f64 = 1.2;

/// A solid stood on the ground it was planned on (`was`), rather than at a height of its own: a deck, a pile in the
/// water, a battlement.
fn stood_on(base: f64, was: f64) -> bool {
    base >= was - SUNK_AT_MOST_M && base <= was + 0.05
}

/// Moves every piece that stood on the ground as it was planned (`was`, the ground's height under it then) by as far
/// as the pads and roads have since moved the ground under it, so none floats or sinks beside a path. A solid at a
/// height of its own moves with a grounded one under it, as a lantern's cage with its post; a solid under a pad, a
/// building's plinth, keeps its height as the pad does.
fn follow_ground(seating: &mut Seating, height: &dyn Fn(f64, f64) -> f64, was: &Planned) {
    let moved = |at: [f64; 3], before: f64| height(at[0], at[1]) - before;
    for (prop, &before) in seating.props.iter_mut().zip(&was.props) {
        if prop.grounded {
            prop.at[2] += moved(prop.at, before);
        }
    }
    // A plinth stands from its footing to its building's floor, which the pad holds where it is.
    let under_pad = |at: [f64; 3]| {
        seating.pads.iter().any(|pad| {
            at[0] >= pad.bounds[0] && at[0] <= pad.bounds[2] && at[1] >= pad.bounds[1] && at[1] <= pad.bounds[3]
        })
    };
    // A solid's place to the centimetre: a stack's pieces stand on the same point.
    let place = |at: [f64; 3]| ((at[0] * 100.0).round() as i64, (at[1] * 100.0).round() as i64);
    let bases: std::collections::BTreeSet<(i64, i64)> = seating
        .solids
        .iter()
        .zip(&was.solids)
        .filter(|(solid, before)| stood_on(solid.at[2], **before) && !under_pad(solid.at))
        .map(|(solid, _)| place(solid.at))
        .collect();
    for (solid, &before) in seating.solids.iter_mut().zip(&was.solids) {
        if bases.contains(&place(solid.at)) {
            solid.at[2] += moved(solid.at, before);
        }
    }
}

/// The ground's height under each prop and solid of a layout, as it lay when they were planned.
struct Planned {
    props: Vec<f64>,
    solids: Vec<f64>,
}

/// Which nodes each node's layout links to: a patrol area to the instances nearer it than any other patrol area, an
/// instance to that patrol area. With no patrol area, nothing links.
#[must_use]
pub fn links_of(nodes: &[Node]) -> BTreeMap<String, Vec<Link>> {
    let patrols: Vec<&Node> = nodes.iter().filter(|node| node.kind == NodeKind::Patrol).collect();
    let square =
        |from: [f64; 2], to: [f64; 2]| (to[0] - from[0]) * (to[0] - from[0]) + (to[1] - from[1]) * (to[1] - from[1]);
    let mut links: BTreeMap<String, Vec<Link>> = BTreeMap::new();
    for node in nodes.iter().filter(|node| !matches!(node.kind, NodeKind::Patrol | NodeKind::Social)) {
        let middle = middle_of(node);
        let nearest = patrols.iter().min_by(|first, second| {
            square(middle_of(first), middle)
                .total_cmp(&square(middle_of(second), middle))
                .then(first.id.cmp(&second.id))
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
    let claims: Vec<Vec<[f64; 2]>> =
        nodes.iter().map(|node| node.ring.iter().map(|point| [point.x as f64, point.y as f64]).collect()).collect();
    let mut layouts: Vec<Layout> = nodes
        .iter()
        .enumerate()
        .map(|(number, node)| {
            let linked = links.get(&node.id).map_or(&[][..], Vec::as_slice);
            let avoid: Vec<Vec<[f64; 2]>> = claims
                .iter()
                .enumerate()
                .filter(|&(other, _)| other != number)
                .map(|(_, claim)| claim.clone())
                .collect();
            plan(node, &landmass.surface, &briefs.of(&node.id, node.kind), linked, book, rise, &avoid)
        })
        .collect();
    landmass.surface.sculpts = Sculpts::from(layouts.iter().map(|layout| layout.sculpt.clone()).collect::<Vec<_>>());
    // Every piece was planned on the carved ground (the carving keeps off the floor the pieces stand on, and rock
    // stands on the carved faces), so it is that ground the pads and roads are measured from.
    let planned: Vec<Planned> = layouts
        .iter()
        .map(|layout| {
            let under = |at: [f64; 3]| landmass.surface.height_at(at[0], at[1]);
            Planned {
                props: layout.seating.props.iter().map(|prop| under(prop.at)).collect(),
                solids: layout.seating.solids.iter().map(|solid| under(solid.at)).collect(),
            }
        })
        .collect();
    let mut pads: Vec<Pad> = landmass.surface.pads.clone().into();
    pads.extend(layouts.iter().flat_map(|layout| layout.seating.pads.iter().copied()));
    landmass.surface.pads = Pads::from(pads);
    let roads: Vec<(Vec<(f64, f64)>, f64)> = layouts
        .iter()
        .flat_map(|layout| {
            // A run's floor is carved to its level along its line, so its way needs no bed: a bed averaged over
            // its points would step where its beats' flat floors meet its ramps.
            let carved = |path: &&crate::paths::Path| layout.runs.iter().any(|run| run.line == path.points);
            layout
                .paths
                .iter()
                .filter(move |path| !carved(path))
                .map(|path| (dense(&path.points, PATH_STEP_M), path.tier.width()))
        })
        .collect();
    landmass.surface.add_roads(&roads);
    let ground = &landmass.surface;
    for (layout, was) in layouts.iter_mut().zip(&planned) {
        follow_ground(&mut layout.seating, &|x, y| ground.height_at(x, y), was);
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
        let ring =
            vec![Point { x, y: 0 }, Point { x: x + 100, y: 0 }, Point { x: x + 100, y: 100 }, Point { x, y: 100 }];
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
    fn what_stood_on_the_ground_follows_it_and_what_stood_above_it_stays() {
        use city::solids::{Material, Shape, Solid};
        let prop = |at: [f64; 3], grounded: bool| crate::seat::Seated {
            model: 1,
            at,
            yaw: 0.0,
            building: false,
            footprint: [0.0; 4],
            purpose: 0,
            open: false,
            grounded,
        };
        let solid = |at: [f64; 3]| Solid::upright(Shape::Block, at, [0.3, 0.3, 2.0], Material::Timber);
        let mut seating = Seating {
            props: vec![prop([0.0, 0.0, 10.0], true), prop([5.0, 0.0, 14.0], false)],
            // A post sunk in the ground with a cage on it, and a deck's pile standing in the water far below.
            solids: vec![solid([1.0, 1.0, 9.7]), solid([1.0, 1.0, 12.4]), solid([3.0, 3.0, -8.0])],
            ..Seating::default()
        };
        let was = Planned { props: vec![10.0, 10.0], solids: vec![10.0, 10.0, 10.0] };
        // The road's bed lowered the ground 0.2 m everywhere.
        follow_ground(&mut seating, &|_, _| 9.8, &was);
        let heights = |list: &[[f64; 3]]| list.iter().map(|at| (at[2] * 100.0).round() / 100.0).collect::<Vec<_>>();
        assert_eq!(heights(&seating.props.iter().map(|prop| prop.at).collect::<Vec<_>>()), [9.8, 14.0]);
        assert_eq!(heights(&seating.solids.iter().map(|solid| solid.at).collect::<Vec<_>>()), [9.5, 12.2, -8.0]);
    }

    #[test]
    fn a_plinth_keeps_its_buildings_level_when_the_ground_under_it_moves() {
        use city::solids::{Material, Shape, Solid};
        // A building's pad 10 m square at 10 m, on a plinth from 8.8 m where the ground falls to 9 m under its middle.
        let plinth = Solid::upright(Shape::Block, [5.0, 5.0, 8.8], [10.3, 10.3, 1.2], Material::Stone);
        let mut seating = Seating {
            solids: vec![plinth],
            pads: vec![Pad { bounds: [0.0, 0.0, 10.0, 10.0], level: 10.0 }],
            ..Seating::default()
        };
        let was = Planned { props: Vec::new(), solids: vec![9.0] };
        // A road's bed beside it raised the ground under the plinth's middle.
        follow_ground(&mut seating, &|_, _| 9.4, &was);
        let top = seating.solids[0].at[2] + seating.solids[0].size[2];
        assert!((top - 10.0).abs() < 1e-9, "the plinth's top stays at its floor: {top}");
    }

    #[test]
    fn a_line_is_laid_with_a_point_every_few_metres() {
        let points = dense(&[[0.0, 0.0], [10.0, 0.0]], 4.0);
        assert_eq!(points.len(), 4);
        assert_eq!(points.last(), Some(&(10.0, 0.0)));
    }
}
