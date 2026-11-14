//! The world's layout: where each continent and static isle sits. It is authored by hand in
//! `content/world/layout.json` and read by the tools, the server and the client alike.

use crate::geometry::Point;
use serde::{Deserialize, Serialize};

/// The whole layout file.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Layout {
    pub continents: Vec<Continent>,
    pub isles: Vec<Isle>,
}

/// A continent: its outline, hand-drawn, and the climate profile its main biome starts from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Continent {
    /// Stable for good: places, saves and the server refer to it.
    pub id: String,
    /// The coast as a closed ring of points, in whole metres; the last point joins back to the first.
    pub outline: Vec<Point>,
    /// The climate profile the main biome starts from; empty until the owner chooses.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub climate: Option<String>,
}

/// A static isle: a place, a size and the seed its land is generated from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Isle {
    /// Stable for good: the first discoverer's name is kept against it.
    pub id: String,
    pub centre: Point,
    /// The isle's land stays within this many metres of its centre.
    pub radius_m: i64,
    /// Kept below 2^32 so a browser reads it exactly.
    pub seed: u32,
    /// The isle's one biome; empty until chosen.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub climate: Option<String>,
}

/// Reads a layout file's text.
pub fn parse(text: &str) -> Result<Layout, serde_json::Error> {
    serde_json::from_str(text)
}

/// Writes a layout file's text: indented, with each point on one line as `[x, y]`, so a coast of thousands of points
/// stays readable and a change to it reads as the points that moved.
pub fn write(layout: &Layout) -> Result<String, serde_json::Error> {
    write_value(layout)
}

/// Any authored file's text in the same written form: indented, each `[x, y]` point on one line.
pub fn write_value<T: Serialize>(value: &T) -> Result<String, serde_json::Error> {
    let pretty = serde_json::to_string_pretty(value)?;
    let lines: Vec<&str> = pretty.lines().collect();
    let mut out = String::with_capacity(pretty.len());
    let mut index = 0;
    while index < lines.len() {
        if let Some(point) = point_at(&lines[index..]) {
            out.push_str(&point);
            index += 4;
        } else {
            out.push_str(lines[index]);
            index += 1;
        }
        out.push('\n');
    }
    Ok(out)
}

/// When `lines` start with a point as serde pretty-prints it (a line ending `[`, a number, a number, `]`), that point
/// on one line, keeping whatever opened it (an indent, or a key such as `"centre": `).
fn point_at(lines: &[&str]) -> Option<String> {
    let [open, first, second, close, ..] = lines else { return None };
    let is_number = |text: &str| !text.is_empty() && text.trim_start_matches('-').chars().all(|ch| ch.is_ascii_digit());
    let lead = open.strip_suffix('[')?;
    let first = first.trim().strip_suffix(',')?;
    let second = second.trim();
    let after = close.trim().strip_prefix(']')?;
    (is_number(first) && is_number(second) && (after.is_empty() || after == ","))
        .then(|| format!("{lead}[{first}, {second}]{after}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_layout_reads_and_writes_back_the_same() {
        let text = "{\n  \"continents\": [],\n  \"isles\": []\n}\n";
        let layout = parse(text).unwrap();
        assert_eq!(layout, Layout::default());
        assert_eq!(write(&layout).unwrap(), text);
    }

    #[test]
    fn a_continent_and_an_isle_read_with_their_fields() {
        let text = r#"{
          "continents": [{ "id": "first", "outline": [[0, 0], [10, 0], [10, 10]], "climate": "temperate" }],
          "isles": [{ "id": "rock", "centre": [50, 60], "radius_m": 5, "seed": 7 }]
        }"#;
        let layout = parse(text).unwrap();
        assert_eq!(layout.continents[0].outline[1], Point::new(10, 0));
        assert_eq!(layout.continents[0].climate.as_deref(), Some("temperate"));
        assert_eq!(layout.isles[0].centre, Point::new(50, 60));
        assert_eq!(layout.isles[0].climate, None);
    }

    #[test]
    fn points_are_written_one_to_a_line() {
        let layout = Layout {
            continents: vec![Continent {
                id: "first".to_owned(),
                outline: vec![Point::new(0, 0), Point::new(10, -5), Point::new(3, 7)],
                climate: None,
            }],
            isles: vec![Isle {
                id: "rock".to_owned(),
                centre: Point::new(50, 60),
                radius_m: 5,
                seed: 7,
                climate: None,
            }],
        };
        let text = write(&layout).unwrap();
        assert!(text.contains("        [0, 0],\n        [10, -5],\n        [3, 7]\n"), "{text}");
        assert!(text.contains("      \"centre\": [50, 60],\n"), "{text}");
        assert_eq!(parse(&text).unwrap(), layout, "what is written reads back the same");
    }

    #[test]
    fn an_unknown_field_is_refused_rather_than_silently_dropped() {
        let text = r#"{ "continents": [], "isles": [], "oceans": [] }"#;
        assert!(parse(text).is_err());
    }
}
