//! The handcrafted modules a layout stands (city's `modules`, built in tools/modules), where its brief asks for
//! heights: each in its area's middle, in place of the blocks and the dressing its area would otherwise take.

use crate::areas::Area;
use crate::brief::AreaKind;
use crate::pieces::Kit;
use crate::seat::Seating;

/// The module an area of a kind stands, if any.
#[must_use]
pub const fn of(kind: AreaKind) -> Option<&'static str> {
    match kind {
        AreaKind::Shrine => Some("old-stones"),
        AreaKind::Keep => Some("keep-citadel"),
        _ => None,
    }
}

/// Which areas stand a module: none where the brief does not ask for heights.
#[must_use]
pub fn standing(areas: &[Area], heights: bool) -> Vec<bool> {
    areas.iter().map(|area| heights && of(area.kind).and_then(city::modules::number_of).is_some()).collect()
}

/// Stands an area's module at its middle, its first socket (its gate) turned toward `toward`, on the lowest ground
/// under its foot so no edge of it stands off the land; its walls and pads hold the land's own rise under the rest.
pub fn seat(kit: &mut Kit, area: &Area, toward: [f64; 2]) {
    let Some(name) = of(area.kind) else { return };
    let Some(number) = city::modules::number_of(name) else { return };
    let module = &city::modules::all()[number as usize];
    let socket = module.sockets.first().map_or("", |socket| socket.name.as_str());
    // Its foot as it will stand, turned a quarter or not.
    let quarters = (turn_toward(number, socket, toward) / std::f64::consts::FRAC_PI_2).round() as i32;
    let [width, depth] =
        if quarters % 2 == 0 { [module.size[0], module.size[1]] } else { [module.size[1], module.size[0]] };
    let low = (-2..=2)
        .flat_map(|east| (-2..=2).map(move |south| (east, south)))
        .map(|(east, south)| {
            let at = [area.at[0] + f64::from(east) * width / 4.0, area.at[1] + f64::from(south) * depth / 4.0];
            kit.height(at)
        })
        .fold(f64::INFINITY, f64::min);
    stand(kit, name, [area.at[0], area.at[1], low], (socket, toward));
}

/// Stands a module by name, its foot's middle at `at`, turned a whole quarter at a time (so its parts stay square to
/// the world) to the quarter that best faces its socket named `socket` toward `toward`.
pub fn stand(kit: &mut Kit, name: &str, at: [f64; 3], toward: (&str, [f64; 2])) {
    let Some(number) = city::modules::number_of(name) else { return };
    stand_stretched(kit, name, at, toward, city::modules::all()[number as usize].size[2]);
}

/// Stands a module as `stand` does, stretched up to `high` metres from its own height (`modules::stretched`).
pub fn stand_stretched(kit: &mut Kit, name: &str, at: [f64; 3], (socket, toward): (&str, [f64; 2]), high: f64) {
    let Some(number) = city::modules::number_of(name) else { return };
    let turn = turn_toward(number, socket, toward);
    for solid in city::modules::stretched(number, at, turn, high) {
        kit.solid(solid);
    }
}

/// The whole quarter turn, radians, that best faces a module's socket named `socket` toward `toward`.
fn turn_toward(number: u32, socket: &str, toward: [f64; 2]) -> f64 {
    let facing = city::modules::all()[number as usize]
        .sockets
        .iter()
        .find(|each| each.name == socket)
        .map_or([0.0, 1.0], |each| each.facing);
    let quarter = std::f64::consts::FRAC_PI_2;
    (0..4)
        .map(|quarters| f64::from(quarters) * quarter)
        .max_by(|&first, &second| {
            let toward_of = |turn: f64| {
                let (sine, cosine) = land::exact::sin_cos(turn);
                let turned = [facing[0] * cosine - facing[1] * sine, facing[0] * sine + facing[1] * cosine];
                turned[0] * toward[0] + turned[1] * toward[1]
            };
            toward_of(first).total_cmp(&toward_of(second))
        })
        .unwrap_or(0.0)
}

/// Where a way reaches the module standing at an area's middle: 2 m out past its first socket, or the middle where
/// none stands.
#[must_use]
pub fn hub(seating: &Seating, area: &Area) -> [f64; 2] {
    let standing = seating.solids.iter().find(|solid| {
        matches!(solid.shape, city::solids::Shape::Module { group: 0, .. })
            && crate::field::distance([solid.at[0], solid.at[1]], area.at) < 1.0
    });
    let Some(solid) = standing else { return area.at };
    let city::solids::Shape::Module { module, .. } = solid.shape else { return area.at };
    let Some(socket) = city::modules::all().get(module as usize).and_then(|found| found.sockets.first()) else {
        return area.at;
    };
    let out = [socket.at[0] + socket.facing[0] * 2.0, socket.at[1] + socket.facing[1] * 2.0, 0.0];
    let [east, south, _] = solid.place(out);
    [east, south]
}
