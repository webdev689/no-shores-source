//! The picture list of Saltmere's three zones, from the layouts as laid: `cargo test -p room --test shots_listed
//! shot_list -- --ignored` writes target/shots/saltmere.json (or `$SHOT_LIST`) for the picture driver's views.

use city::solids::Shape as SolidShape;
use layout::brief::Briefs;
use layout::field::ring_holds;
use std::path::Path;

const ZONES: [&str; 3] = ["saltgrass-downs", "gullwing-vale", "driftwood-moors"];

/// Continent 1's layouts as the bake settles them with these briefs, its nodes' claims and its ground as laid.
fn continent_one(briefs: &Briefs) -> (Vec<layout::Layout>, Vec<Vec<[f64; 2]>>, land::ground::Ground) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let continent = world.continents.into_iter().find(|continent| continent.id == "continent-1").expect("continent-1");
    let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("the edits parse");
    let claims =
        edits.nodes.iter().map(|node| node.ring.iter().map(|point| [point.x as f64, point.y as f64]).collect());
    let claims = claims.collect();
    let builders = bake::builders(&root).expect("the builders read");
    let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let mut landmass = land::landmass::generate(&continent, edits).expect("continent-1 generates");
    city::settle(&mut landmass, &city).expect("its city settles");
    let layouts = layout::settle::settle(&mut landmass, &builders.book, briefs);
    (layouts, claims, landmass.surface)
}

fn briefs() -> Briefs {
    bake::builders(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")).expect("the builders read").briefs
}

/// How far a point lies from a box's footprint, metres (0 inside it).
fn off_box(at: [f64; 2], b: &[f64; 6]) -> f64 {
    let across = (b[0] - at[0]).max(0.0).max(at[0] - b[2]);
    let down = (b[1] - at[1]).max(0.0).max(at[1] - b[3]);
    (across * across + down * down).sqrt()
}

/// Compass degrees (0 north, a quarter turn east) from one point to another, rounded to a degree.
fn compass(from: [f64; 2], to: [f64; 2]) -> f64 {
    libm::atan2(to[0] - from[0], from[1] - to[1]).to_degrees().rem_euclid(360.0).round()
}

/// A name as a file name: lower case, other characters as dashes.
fn slug(name: &str) -> String {
    let dashed: String =
        name.chars().map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' }).collect();
    dashed.split('-').filter(|part| !part.is_empty()).collect::<Vec<_>>().join("-")
}

/// A shot-list view: east, south, bearing, camera and name, the point rounded to a decimetre.
fn view(at: [f64; 2], bearing: f64, camera: &str, name: &str) -> serde_json::Value {
    serde_json::json!([(at[0] * 10.0).round() / 10.0, (at[1] * 10.0).round() / 10.0, bearing, camera, name])
}

/// Where a way first comes into an area: the point of the first path touching it that lies just outside its reach.
fn way_in(laid: &layout::Layout, area: &layout::areas::Area) -> Option<[f64; 2]> {
    let near = |point: &[f64; 2]| libm::hypot(point[0] - area.at[0], point[1] - area.at[1]) <= area.radius;
    laid.paths.iter().find_map(|path| {
        let first = path.points.iter().position(near)?;
        let outside = if first > 0 { first - 1 } else { path.points.iter().position(|point| !near(point))? };
        path.points.get(outside).copied()
    })
}

/// The point a distance back along a line from one of its points, walking its segments.
fn back_along(line: &[[f64; 2]], from: [f64; 2], distance: f64) -> [f64; 2] {
    let at = line.iter().position(|point| *point == from).unwrap_or(0);
    let mut left = distance;
    for pair in line[..=at].windows(2).rev() {
        let length = layout::field::distance(pair[0], pair[1]);
        if length >= left {
            let share = left / length.max(1e-9);
            return [pair[1][0] + (pair[0][0] - pair[1][0]) * share, pair[1][1] + (pair[0][1] - pair[1][1]) * share];
        }
        left -= length;
    }
    line[0]
}

/// Writes the views of each Saltmere zone for the picture driver's `views` step, each standing in the open: every area
/// from its first way in facing its middle, every run beat from its way in, and three high views looking down at the
/// zone. It writes to `target/shots/saltmere.json`, or to `$SHOT_LIST`. Run it where the pictures are to be taken, so
/// the views follow the runs as laid then: `cargo test -p room --test shots_listed shot_list -- --ignored`.
#[test]
#[ignore = "writes target/shots/saltmere.json"]
fn shot_list() {
    let (layouts, _, ground) = continent_one(&briefs());
    let mut zones = serde_json::Map::new();
    for id in ZONES {
        let laid = layouts.iter().find(|layout| layout.id == id).expect("the zone lays out");
        let mut views = Vec::new();
        // Where an area's first way enters, a little inside the rim; with no way, south of its middle.
        let stand_in = |area: &layout::areas::Area| {
            let from = way_in(laid, area).unwrap_or([area.at[0], area.at[1] + area.radius]);
            let reach = (libm::hypot(from[0] - area.at[0], from[1] - area.at[1])).min(area.radius * 0.9);
            let along = reach / libm::hypot(from[0] - area.at[0], from[1] - area.at[1]).max(1e-9);
            [area.at[0] + (from[0] - area.at[0]) * along, area.at[1] + (from[1] - area.at[1]) * along]
        };
        for (number, area) in laid.areas.iter().enumerate() {
            let stand = stand_in(area);
            // An area with no name of its own is named for its kind.
            let name = if area.name.is_empty() { format!("{:?}", area.kind) } else { area.name.clone() };
            views.push(view(stand, compass(stand, area.at), "first", &format!("area{number}_{}", slug(&name))));
        }
        for run in &laid.runs {
            // On the run's own line, which nothing stands on, back from each beat's middle: at its rim, or inside a
            // building's room (its walls at ROOM_SHARE of the beat), looking at the middle.
            let share = if run.kind.building() { 0.6 } else { 1.0 };
            for (number, beat) in run.beats.iter().enumerate() {
                let entry = back_along(&run.line, beat.at, beat.radius * share);
                views.push(view(entry, compass(entry, beat.at), "first", &format!("run_{}_{number}", slug(&run.name))));
            }
        }
        // From a river's bank where it runs through the section, looking along it, at a body's height and from above.
        let course: Vec<&land::ground::CoursePoint> =
            ground.rivers.iter().flatten().filter(|point| ring_holds(&laid.ring, point.x, point.y)).collect();
        if let [.., before, after] = course[..course.len().min(course.len() / 2 + 2)] {
            let along = libm::hypot(after.x - before.x, after.y - before.y).max(1e-9);
            let across = [-(after.y - before.y) / along, (after.x - before.x) / along];
            let banks = [-1.0, 1.0].into_iter().flat_map(|side| {
                [8.0, 16.0].map(|out| {
                    let off = side * (before.width / 2.0 + out);
                    [before.x + across[0] * off, before.y + across[1] * off]
                })
            });
            let floor = |at: [f64; 2]| ground.height_at(at[0], at[1]);
            let open = |at: [f64; 2]| {
                laid.boxes.iter().all(|b| off_box(at, b) >= 0.6 || b[5] >= floor(at) + 1.9 || b[4] <= floor(at) + 0.3)
            };
            if let Some(stand) = banks.into_iter().find(|&at| ring_holds(&laid.ring, at[0], at[1]) && open(at)) {
                let toward = [after.x, after.y];
                views.push(view(stand, compass(stand, toward), "first", "river_0"));
                views.push(view(stand, compass(stand, toward), "third,60,25", "river_1"));
            }
        }
        // Into each cavern from its tunnel's mouth, and from inside its hollow back toward the mouth.
        let caverns = laid.map.connections.iter().filter(|joined| joined.joined == layout::spaces::Joined::Tunnel);
        for (number, tunnel) in caverns.enumerate() {
            let (mouth, middle) = (tunnel.points[0], tunnel.points[1]);
            let inside = [middle[0] + (mouth[0] - middle[0]) * 0.3, middle[1] + (mouth[1] - middle[1]) * 0.3];
            let back = [mouth[0] + (middle[0] - mouth[0]) * 0.05, mouth[1] + (middle[1] - mouth[1]) * 0.05];
            views.push(view(back, compass(back, middle), "first", &format!("cavern{number}_in")));
            views.push(view(inside, compass(inside, mouth), "first", &format!("cavern{number}_out")));
        }
        // Up each ledge's stair from the low floor before its slot, and back down over it from the high floor.
        let stairs = laid.map.connections.iter().filter(|joined| joined.joined == layout::spaces::Joined::Stair);
        for (number, stair) in stairs.enumerate() {
            let (start, edge) = (stair.points[0], stair.points[1]);
            let long = libm::hypot(edge[0] - start[0], edge[1] - start[1]).max(1e-9);
            let way = [(edge[0] - start[0]) / long, (edge[1] - start[1]) / long];
            let below = [start[0] - way[0] * 3.0, start[1] - way[1] * 3.0];
            let above = [edge[0] + way[0] * 9.0, edge[1] + way[1] * 9.0];
            views.push(view(below, compass(below, edge), "first", &format!("stair{number}_up")));
            views.push(view(above, compass(above, start), "third,25,35", &format!("stair{number}_down")));
        }
        // Before each module's first socket, looking at its middle from a little way up.
        for solid in
            laid.seating.solids.iter().filter(|solid| matches!(solid.shape, SolidShape::Module { group: 0, .. }))
        {
            let SolidShape::Module { module, .. } = solid.shape else { continue };
            let found = &city::modules::all()[module as usize];
            let Some(socket) = found.sockets.first().filter(|_| !found.name.starts_with("cliff-stair")) else {
                continue;
            };
            let out =
                solid.place([socket.at[0] + socket.facing[0] * 14.0, socket.at[1] + socket.facing[1] * 14.0, 0.0]);
            let stand = [out[0], out[1]];
            views.push(view(
                stand,
                compass(stand, [solid.at[0], solid.at[1]]),
                "third,45,25",
                &format!("module_{}", found.name),
            ));
        }
        // From where a way enters an area, looking across the zone to its areas' middle.
        let count = laid.areas.len();
        let middle = [0, 1].map(|axis| laid.areas.iter().map(|each| each.at[axis]).sum::<f64>() / count as f64);
        for index in [0, count / 2, count.saturating_sub(1)] {
            let stand = stand_in(&laid.areas[index]);
            views.push(view(stand, compass(stand, middle), "third,200,40", &format!("high_{index}")));
        }
        for entry in &views {
            let at = [entry[0].as_f64().unwrap_or(0.0), entry[1].as_f64().unwrap_or(0.0)];
            assert!(ring_holds(&laid.ring, at[0], at[1]), "{id}: {entry} is inside the section");
            // In the open: no box within a body's reach of the point between its knees and its head.
            let floor = ground.height_at(at[0], at[1]);
            let walled = laid.boxes.iter().find(|b| off_box(at, b) < 0.6 && b[5] < floor + 1.9 && b[4] > floor + 0.3);
            assert!(walled.is_none(), "{id}: {entry} stands in {walled:?}");
        }
        zones.insert(id.to_string(), serde_json::Value::Array(views));
    }
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let path = std::env::var_os("SHOT_LIST").map_or_else(|| root.join("target/shots/saltmere.json"), Into::into);
    std::fs::create_dir_all(path.parent().expect("a folder")).expect("the folder is made");
    let text = serde_json::to_string_pretty(&serde_json::Value::Object(zones)).expect("the list writes");
    std::fs::write(path, text + "\n").expect("the shot list is written");
}
