//! The open landmass's city and its layouts, settled on its land each time its ground is laid, and what a node's room
//! is cut from it: a window of the ground and the boxes a body runs into there, the same as the bake cuts for the
//! server, and the city's plan and the layouts for the drawing.

use super::{OPEN, hand_over, header_of, read};
use city::Plan;
use city::rmb::Blocks;
use land::landmass::Landmass;
use layout::Layout;
use layout::book::{Book, Measure, RmbBlock};
use layout::brief::{Brief, Briefs};
use serde_json::{Value, json};
use std::cell::RefCell;
use std::collections::BTreeMap;

/// The RMB blocks the open landmass was opened with, what its layouts are built with, its city's plan, or why it
/// could not be planned, and its layouts.
#[derive(Debug, Default)]
struct Settled {
    blocks: Blocks,
    book: Book,
    briefs: Briefs,
    plan: Option<Plan>,
    problem: Option<(String, String)>,
    layouts: Vec<Layout>,
}

thread_local! {
    static CITY: RefCell<Settled> = RefCell::new(Settled::default());
}

/// The RMB blocks a request names: its `rmb`, the RMB index's JSON, or no blocks for none.
pub fn blocks_from(request: &Value) -> Result<Blocks, String> {
    if request["rmb"].is_null() { Ok(Blocks::default()) } else { Blocks::from_index(&request["rmb"].to_string()) }
}

/// What a request gives the layouts to build with: `rmbBlocks`, the RMB table's block files' lists; `forged`, the
/// forged tables (`buildings` and `props`); `briefs`, every node's brief. Each missing part is empty.
pub fn book_from(request: &Value) -> Result<(Book, Briefs), String> {
    let mut book = Book::default();
    if let Some(files) = request["rmbBlocks"].as_array() {
        for file in files {
            let blocks: Vec<RmbBlock> =
                serde_json::from_value(file.clone()).map_err(|error| format!("an RMB block file: {error}"))?;
            book.blocks.extend(blocks.into_iter().map(|block| (block.name.clone(), block)));
        }
    }
    let measures = |table: &Value| -> Result<BTreeMap<u32, Measure>, String> {
        if table.is_null() {
            return Ok(BTreeMap::new());
        }
        let read: BTreeMap<String, Measure> =
            serde_json::from_value(table.clone()).map_err(|error| format!("a forged table: {error}"))?;
        read.into_iter()
            .map(|(id, measure)| id.parse().map(|id| (id, measure)).map_err(|_| format!("a model id {id}")))
            .collect()
    };
    book.buildings = measures(&request["forged"]["buildings"])?;
    book.props = measures(&request["forged"]["props"])?;
    let briefs = if request["briefs"].is_null() {
        Briefs::default()
    } else {
        Briefs(
            serde_json::from_value::<BTreeMap<String, Brief>>(request["briefs"].clone())
                .map_err(|error| format!("the briefs: {error}"))?,
        )
    };
    Ok((book, briefs))
}

/// Keeps the blocks a newly opened landmass's city is filled with, and what its layouts are built with.
pub fn keep_blocks(blocks: Blocks, book: Book, briefs: Briefs) {
    CITY.with(|city| {
        let mut city = city.borrow_mut();
        (city.blocks, city.book, city.briefs) = (blocks, book, briefs);
    });
}

/// Plans the landmass's city and lays its pads on the ground, after anything that laid the ground again.
pub fn settle(landmass: &mut Landmass) {
    CITY.with(|city| {
        let mut city = city.borrow_mut();
        let id = landmass.edits.city.as_ref().map(|city| city.id.clone()).unwrap_or_default();
        match city::settle(landmass, &city.blocks) {
            Ok(plan) => (city.plan, city.problem) = (plan, None),
            Err(error) => (city.plan, city.problem) = (None, Some((id, error))),
        }
        city.layouts = layout::settle::settle(landmass, &city.book, &city.briefs);
    });
}

/// A landmass's header, with its city's problem among the others when it could not be planned.
pub fn header_with_city(landmass: &Landmass) -> Value {
    let mut header = header_of(landmass);
    CITY.with(|city| {
        if let (Some((subject, message)), Some(problems)) = (&city.borrow().problem, header["problems"].as_array_mut())
        {
            problems.push(json!({ "subject": subject, "message": message }));
        }
    });
    header
}

/// A rect from `{ "west", "north", "east", "south" }`, metres, each a number.
fn rect_of(request: &Value) -> Result<[f64; 4], String> {
    let side =
        |key: &str| request[key].as_f64().filter(|value| value.is_finite()).ok_or(format!("a rect needs its {key}"));
    Ok([side("west")?, side("north")?, side("east")?, side("south")?])
}

/// The open landmass's ground over a rect, cut as a node's window, as JSON: what the movement door stands bodies on.
#[must_use]
pub fn window_json(request: &[u8]) -> String {
    let cut = read(request).and_then(|request| {
        let [west, north, east, south] = rect_of(&request)?;
        OPEN.with(|open| {
            let open = open.borrow();
            let landmass = open.as_ref().ok_or("no landmass is open")?;
            serde_json::to_string(&landmass.surface.window(west, north, east, south)).map_err(|error| error.to_string())
        })
    });
    cut.unwrap_or_else(|error| json!({ "error": error }).to_string())
}

/// The boxes of the open landmass's city a body runs into within a rect, as `[west, north, east, south, top, bottom]`; none
/// with no city.
#[must_use]
pub fn boxes_json(request: &[u8]) -> String {
    let found = read(request).and_then(|request| rect_of(&request)).map(|bounds| {
        CITY.with(|city| {
            let city = city.borrow();
            let mut boxes =
                city.plan.as_ref().map(|plan| city::collision::boxes_within(plan, bounds)).unwrap_or_default();
            boxes.extend(city.layouts.iter().flat_map(|layout| layout::collide::within(&layout.boxes, bounds)));
            json!({ "boxes": boxes }).to_string()
        })
    });
    found.unwrap_or_else(|error| json!({ "error": error }).to_string())
}

/// The open landmass's city's plan as JSON, or `null` with none.
#[must_use]
pub fn city_plan_json() -> String {
    CITY.with(|city| serde_json::to_string(&city.borrow().plan).unwrap_or_else(|_| "null".to_owned()))
}

/// The open landmass's layouts as JSON: a list, empty with none.
#[must_use]
pub fn layouts_json() -> String {
    CITY.with(|city| serde_json::to_string(&city.borrow().layouts).unwrap_or_else(|_| "[]".to_owned()))
}

/// The open landmass's layouts.
#[unsafe(no_mangle)]
pub extern "C" fn land_layouts() -> u64 {
    hand_over(layouts_json().into_bytes())
}

/// The open landmass's ground over the rect the request at `address`, `length` bytes long, names, as a window.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn land_window(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let request = unsafe { std::slice::from_raw_parts(address, length) };
    hand_over(window_json(request).into_bytes())
}

/// The city's boxes within the rect the request at `address`, `length` bytes long, names.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn land_boxes(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    let request = unsafe { std::slice::from_raw_parts(address, length) };
    hand_over(boxes_json(request).into_bytes())
}

/// The open landmass's city's plan.
#[unsafe(no_mangle)]
pub extern "C" fn land_city_plan() -> u64 {
    hand_over(city_plan_json().into_bytes())
}

#[cfg(test)]
mod tests {
    use super::super::open_view;
    use super::*;

    /// A square continent with its city on the east coast, and a node inland.
    const OPENED: &str = r#"{ "id": "square", "keep": true, "rmb": null,
        "edits": { "strokes": [], "city": { "id": "harbour", "name": "Harbour", "centre": [319000, 360000], "motif": "beacon" } },
        "layout": { "continents": [{ "id": "square", "outline": [[200000, 300000], [320000, 300000], [320000, 420000], [200000, 420000]] }], "isles": [] } }"#;

    #[test]
    fn opening_a_landmass_settles_its_city_and_cuts_windows_as_the_bake_does() {
        let opened = open_view(OPENED.as_bytes());
        assert!(!opened.is_empty());
        let plan: Value = serde_json::from_str(&city_plan_json()).unwrap();
        assert_eq!(plan["id"], "harbour");
        let social = &plan["social"]["bounds"];
        let rect = [
            social[0].as_f64().unwrap(),
            social[1].as_f64().unwrap(),
            social[2].as_f64().unwrap(),
            social[3].as_f64().unwrap(),
        ];
        let request = json!({ "west": rect[0], "north": rect[1], "east": rect[2], "south": rect[3] }).to_string();
        let window: land::ground::Ground = serde_json::from_str(&window_json(request.as_bytes())).unwrap();
        let level = plan["social"]["level"].as_f64().unwrap();
        let middle = [(rect[0] + rect[2]) / 2.0, (rect[1] + rect[3]) / 2.0];
        assert_eq!(window.height_at(middle[0], middle[1]), level, "the plaza's pad is in the window");
        let boxes: Value = serde_json::from_str(&boxes_json(request.as_bytes())).unwrap();
        assert!(!boxes["boxes"].as_array().unwrap().is_empty(), "the plaza's parapets");
        let refused: Value = serde_json::from_str(&window_json(br#"{ "west": 1 }"#)).unwrap();
        assert_eq!(refused["error"], "a rect needs its north");
    }
}
