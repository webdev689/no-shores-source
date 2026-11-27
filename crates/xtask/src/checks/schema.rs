//! A FlatBuffers table numbers its fields by their order, so a field moved, retyped or removed reads as another on
//! every page and room already shipped. Each table holds main's fields in their order, new ones after them, and a
//! struct, laid out byte for byte, holds them exactly: a three-way merge can put a branch's new field mid-table with no
//! conflict, and only this sees it. Main is where the branch left it (the merge base with `origin/main`), so a branch
//! behind main is not taken for one that moved main's fields.

use super::Problem;

/// The ref the schemas are held to.
pub const MAIN: &str = "origin/main";

/// One table or struct: which, its name, the line it starts on, and its fields as `name: type`.
struct Table {
    kind: &'static str,
    name: String,
    line: usize,
    fields: Vec<String>,
}

/// The tables of a schema, in order, read past its `//` comments.
fn tables(schema: &str) -> Vec<Table> {
    let mut found: Vec<Table> = Vec::new();
    let mut open = false;
    for (index, line) in schema.lines().enumerate() {
        let code = line.split("//").next().unwrap_or("").trim();
        let opened =
            ["table", "struct"].into_iter().find_map(|kind| Some((kind, code.strip_prefix(kind)?.strip_prefix(' ')?)));
        if let Some((kind, rest)) = opened {
            let name = rest.split(|mark: char| mark == '{' || mark.is_whitespace()).next().unwrap_or("");
            found.push(Table { kind, name: name.to_owned(), line: index + 1, fields: Vec::new() });
            // A table written on one line, `table Empty {}`, holds no field and closes where it opens.
            open = !rest.contains('}');
        } else if open && code.starts_with('}') {
            open = false;
        } else if let (true, Some((name, rest)), Some(table)) = (open, code.split_once(':'), found.last_mut()) {
            let kind = rest.trim().split([' ', ';', '=', '(']).next().unwrap_or("");
            table.fields.push(format!("{}: {kind}", name.trim()));
        }
    }
    found
}

/// What is wrong with `path`'s tables as they stand (`now`) against the same file on main (`main`).
pub fn check(path: &str, now: &str, main: &str) -> Vec<Problem> {
    let before = tables(main);
    tables(now)
        .into_iter()
        .filter_map(|table| {
            let held = &before.iter().find(|old| old.name == table.name && old.kind == table.kind)?.fields;
            if table.kind == "struct" {
                let message =
                    format!("struct {}: its fields are not main's: a struct's layout never changes", table.name);
                return (*held != table.fields).then(|| Problem::new("schema", path, Some(table.line), message));
            }
            let moved = held.iter().enumerate().find(|(at, field)| table.fields.get(*at) != Some(*field))?;
            let message = format!(
                "table {}: field {} of main, `{}`, is not there: keep main's fields in their order (deprecate one, \
                 never remove it) and add new ones after them",
                table.name,
                moved.0 + 1,
                moved.1
            );
            Some(Problem::new("schema", path, Some(table.line), message))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::check;

    const MAIN: &str = "// The gear.\ntable GearItem {\n  id: uint;\n  kind: ubyte; // its kind\n  xp: uint = 0;\n}\n";

    fn refused(now: &str) -> Vec<String> {
        check("crates/protocol/gear.fbs", now, MAIN).into_iter().map(|problem| problem.message).collect()
    }

    #[test]
    fn new_fields_after_mains_pass() {
        assert!(refused(MAIN).is_empty());
        assert!(refused(&MAIN.replace("  xp: uint = 0;\n", "  xp: uint = 0;\n  hard: bool;\n")).is_empty());
        assert!(refused(&MAIN.replace("kind: ubyte;", "kind: ubyte (deprecated);")).is_empty());
        assert!(refused(&format!("{MAIN}table Fresh {{\n  a: int;\n}}\n")).is_empty(), "a new table");
    }

    #[test]
    fn a_field_put_mid_table_is_refused() {
        let found = refused(&MAIN.replace("  xp: uint = 0;\n", "  hard: bool;\n  xp: uint = 0;\n"));
        assert_eq!(found.len(), 1);
        assert!(found[0].contains("GearItem") && found[0].contains("`xp: uint`"), "{found:?}");
    }

    #[test]
    fn a_struct_holds_mains_fields_exactly_and_a_one_line_table_holds_none() {
        let main = "struct Mark {\n  x: float;\n}\ntable Empty {}\ntable After {\n  a: int;\n}\n";
        let refused = |now: &str| check("crates/protocol/messages.fbs", now, main).len();
        assert_eq!(refused(main), 0);
        assert_eq!(refused(&main.replace("  x: float;\n", "  x: float;\n  y: float;\n")), 1, "a field added");
        assert_eq!(refused(&main.replace("table Empty {}\n", "table Empty {}\nb: int;\n")), 0, "outside any table");
    }

    #[test]
    fn a_field_removed_or_retyped_is_refused() {
        assert_eq!(refused(&MAIN.replace("  kind: ubyte; // its kind\n", "")).len(), 1);
        assert_eq!(refused(&MAIN.replace("kind: ubyte", "kind: ushort")).len(), 1);
    }
}
