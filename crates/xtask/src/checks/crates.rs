use super::Problem;

/// What a crate may depend on: other crates of this workspace, and outside crates. `*` allows any. A door crate may
/// hold unsafe code, to hand memory across a boundary; no other may. A new crate is declared here in the same change
/// as its entry in the Code Map note.
#[derive(Debug)]
pub struct CrateRule {
    pub name: &'static str,
    pub workspace: &'static [&'static str],
    pub outside: &'static [&'static str],
    pub door: bool,
}

/// The rules crates touch no platform, so the server and a predicting client run them alike.
pub const CRATES: &[CrateRule] = &[
    CrateRule { name: "world", workspace: &[], outside: &["serde", "serde_json"], door: false },
    CrateRule { name: "world-wasm", workspace: &["world"], outside: &["serde_json"], door: true },
    CrateRule { name: "land", workspace: &["world"], outside: &["serde", "serde_json"], door: false },
    CrateRule { name: "land-wasm", workspace: &["city", "land", "world"], outside: &["serde_json"], door: true },
    CrateRule { name: "city", workspace: &["land", "world"], outside: &["serde", "serde_json", "libm"], door: false },
    CrateRule { name: "movement", workspace: &[], outside: &["libm"], door: false },
    CrateRule {
        name: "movement-wasm",
        workspace: &["land", "movement", "reach"],
        outside: &["serde_json"],
        door: true,
    },
    CrateRule { name: "reach", workspace: &[], outside: &[], door: false },
    CrateRule { name: "room", workspace: &["land", "movement", "reach", "world"], outside: &["libm"], door: false },
    CrateRule { name: "protocol", workspace: &["movement", "room"], outside: &["flatbuffers"], door: true },
    CrateRule {
        name: "room-wasm",
        workspace: &["land", "movement", "protocol", "room", "world"],
        outside: &["serde", "serde_json"],
        door: true,
    },
    // A tool run at build time: it bakes what the rooms read, so it may use the rules that make the land.
    CrateRule { name: "bake", workspace: &["city", "land", "world"], outside: &["serde", "serde_json"], door: false },
    CrateRule { name: "xtask", workspace: &["*"], outside: &["*"], door: false },
];

/// One run-time dependency as a manifest names it: the key the code uses, the package it renames
/// (`package = "…"`), and whether it takes its settings from the workspace's own table.
#[derive(Debug, Default)]
struct Entry {
    key: String,
    package: Option<String>,
    inherited: bool,
}

impl Entry {
    fn set(&mut self, field: &str, value: &str) {
        match field {
            "package" => self.package = quoted(value).map(str::to_owned),
            "workspace" => self.inherited = value.trim() == "true",
            _ => {}
        }
    }
}

/// A TOML string's contents, in either quote.
fn quoted(value: &str) -> Option<&str> {
    let value = value.trim();
    let quote = value.chars().next().filter(|ch| matches!(ch, '"' | '\''))?;
    value[1..].split(quote).next()
}

/// The value of `field` in an inline table such as `{ package = "tokio", workspace = true }`.
fn inline_value<'text>(table: &'text str, field: &str) -> Option<&'text str> {
    table.match_indices(field).find_map(|(at, _)| {
        let is_key = table[..at].trim_end().ends_with(['{', ',']);
        let value = table[at + field.len()..].trim_start().strip_prefix('=')?;
        is_key.then(|| value.split([',', '}']).next().unwrap_or_default())
    })
}

/// A table header without its `target.<platform>.` lead, which may be quoted and hold dots of its own.
fn without_platform(header: &str) -> &str {
    let Some(rest) = header.strip_prefix("target.") else { return header };
    let end = match rest.chars().next() {
        Some(quote @ ('\'' | '"')) => rest[1..].find(quote).map_or(rest.len(), |at| at + 2),
        _ => rest.find('.').unwrap_or(rest.len()),
    };
    rest[end..].trim_start_matches('.')
}

/// The entries of one dependency table (`dependencies` or `workspace.dependencies`): the table itself, its
/// per-platform forms, and each `[<table>.<name>]` table.
fn entries(manifest: &str, wanted: &str) -> Vec<Entry> {
    let mut found: Vec<Entry> = Vec::new();
    let mut table = "";
    let mut table_start = 0;
    for line in manifest.lines().map(str::trim).filter(|line| !line.starts_with('#')) {
        if let Some(header) = line.strip_prefix('[') {
            table = without_platform(header.split(']').next().unwrap_or_default().trim());
            table_start = found.len();
            if let Some(key) = table.strip_prefix(wanted).and_then(|rest| rest.strip_prefix('.')) {
                found.push(Entry { key: key.trim_matches(['"', '\'']).to_owned(), ..Entry::default() });
            }
            continue;
        }
        let Some((key, value)) = line.split_once('=') else { continue };
        let mut path = key.split('.').map(|part| part.trim().trim_matches(['"', '\'']));
        let first = path.next().unwrap_or_default();
        if table == wanted && !first.is_empty() {
            let same_table = found[table_start..].iter().position(|entry| entry.key == first);
            let at = same_table.map_or_else(
                || {
                    found.push(Entry { key: first.to_owned(), ..Entry::default() });
                    found.len() - 1
                },
                |offset| table_start + offset,
            );
            match path.next() {
                Some(field) => found[at].set(field, value),
                None => {
                    for field in ["package", "workspace"] {
                        if let Some(setting) = inline_value(value, field) {
                            found[at].set(field, setting);
                        }
                    }
                }
            }
        } else if table.strip_prefix(wanted).is_some_and(|rest| rest.starts_with('.'))
            && let Some(entry) = found.last_mut()
        {
            entry.set(first, value);
        }
    }
    found
}

/// The packages a crate depends on at run time, by their real names: a rename (`package = "…"`) is followed, through
/// the workspace's own table when the dependency is inherited. Development and build dependencies never ship.
pub fn dependencies(manifest: &str, workspace_manifest: &str) -> Vec<String> {
    let shared = entries(workspace_manifest, "workspace.dependencies");
    let own = entries(manifest, "dependencies");
    own.iter()
        .map(|entry| {
            let source = shared.iter().find(|candidate| entry.inherited && candidate.key == entry.key).unwrap_or(entry);
            source.package.clone().unwrap_or_else(|| source.key.clone())
        })
        .collect()
}

fn allows(list: &[&str], name: &str) -> bool {
    list.contains(&"*") || list.contains(&name)
}

/// An attribute from its `#` to its closing `]`, across lines, skipping brackets inside strings.
fn attribute(from: &str) -> &str {
    let mut depth = 0;
    let mut in_string = false;
    let mut escaped = false;
    for (at, ch) in from.char_indices() {
        if in_string {
            in_string = escaped || ch != '"';
            escaped = !escaped && ch == '\\';
            continue;
        }
        match ch {
            '"' => in_string = true,
            '[' => depth += 1,
            ']' if depth == 1 => return &from[..=at],
            ']' => depth -= 1,
            _ => {}
        }
    }
    from
}

/// Whether a source file has an attribute that names unsafe code in any form: `allow`, `expect`, a list, inside
/// `cfg_attr`, or spread over lines. Formatting puts every attribute at the start of a line.
fn allows_unsafe(text: &str) -> bool {
    let mut line_start = 0;
    text.split_inclusive('\n').any(|line| {
        let from = &text[line_start + line.len() - line.trim_start().len()..];
        line_start += line.len();
        (from.starts_with("#[") || from.starts_with("#![")) && attribute(from).contains("unsafe_code")
    })
}

/// Whether a manifest takes the workspace's lints, without which the workspace's `unsafe_code = "deny"` does not
/// reach it.
fn takes_workspace_lints(manifest: &str) -> bool {
    let mut in_lints = false;
    manifest.lines().map(str::trim).any(|line| {
        if let Some(header) = line.strip_prefix('[') {
            in_lints = header.split(']').next().map(str::trim) == Some("lints");
            return false;
        }
        in_lints && line.split_once('=').is_some_and(|(key, value)| key.trim() == "workspace" && value.trim() == "true")
    })
}

/// Only a door crate may allow unsafe code.
pub fn check_unsafe(sources: &[(String, String)]) -> Vec<Problem> {
    sources
        .iter()
        .filter(|(path, text)| path.starts_with("crates/") && path.ends_with(".rs") && allows_unsafe(text))
        .filter_map(|(path, _)| {
            let name = path.strip_prefix("crates/")?.split('/').next()?;
            let door = CRATES.iter().any(|rule| rule.name == name && rule.door);
            (!door).then(|| Problem::new("crates", path, None, format!("{name} is not a door crate: no unsafe code")))
        })
        .collect()
}

/// Every crate takes the workspace's lints, is declared, and depends only on what its rule allows. The workspace's
/// own manifest, `Cargo.toml`, says what an inherited dependency really is.
pub fn check(manifests: &[(String, String)]) -> Vec<Problem> {
    let workspace: Vec<&str> =
        manifests.iter().filter_map(|(path, _)| path.strip_prefix("crates/")?.strip_suffix("/Cargo.toml")).collect();
    let root = manifests.iter().find(|(path, _)| path == "Cargo.toml").map_or("", |(_, text)| text.as_str());
    let mut problems = Vec::new();
    for (path, text) in manifests {
        let Some(name) = path.strip_prefix("crates/").and_then(|rest| rest.strip_suffix("/Cargo.toml")) else {
            continue;
        };
        if !takes_workspace_lints(text) {
            let message = format!("{name} must take the workspace's lints: add `[lints]` with `workspace = true`");
            problems.push(Problem::new("crates", path, None, message));
        }
        let Some(rule) = CRATES.iter().find(|rule| rule.name == name) else {
            let message = format!("crate \"{name}\" is not declared: add it to CRATES and the Code Map");
            problems.push(Problem::new("crates", path, None, message));
            continue;
        };
        for dependency in dependencies(text, root) {
            let (list, kind) = if workspace.contains(&dependency.as_str()) {
                (rule.workspace, "crate")
            } else {
                (rule.outside, "outside crate")
            };
            if !allows(list, &dependency) {
                let message = format!("{name} may not depend on the {kind} \"{dependency}\"");
                problems.push(Problem::new("crates", path, None, message));
            }
        }
    }
    problems
}

#[cfg(test)]
mod tests {
    use super::*;

    const LINTS: &str = "[lints]\nworkspace = true\n";

    fn manifests(list: &[(&str, &str)]) -> Vec<(String, String)> {
        list.iter().map(|(path, text)| ((*path).to_owned(), (*text).to_owned())).collect()
    }

    #[test]
    fn dependencies_are_read_in_every_form() {
        let text = "[package]\nname = \"x\"\n[dependencies]\nserde.workspace = true\nserde_json = \"1\"\nworld = { path = \"../world\" }\n# note\n[dev-dependencies]\nproptest = \"1\"\n";
        assert_eq!(dependencies(text, ""), ["serde", "serde_json", "world"]);
    }

    #[test]
    fn a_dependency_table_or_a_platform_table_still_counts() {
        let text = "[dependencies.tokio]\nversion = \"1\"\n[target.'cfg(target_arch = \"wasm32\")'.dependencies]\nweb-sys = \"0.3\"\n[build-dependencies]\ncc = \"1\"\n";
        assert_eq!(dependencies(text, ""), ["tokio", "web-sys"]);
    }

    #[test]
    fn a_platform_dependency_table_counts_and_a_comment_after_a_header_hides_nothing() {
        let text = "[target.'cfg(unix)'.dependencies.tokio]\nversion = \"1\"\n[target.\"x86_64-pc-windows-gnu\".dependencies.mio]\nversion = \"1\"\n[dependencies] # shipped\nlibc = \"0.2\"\n";
        assert_eq!(dependencies(text, ""), ["tokio", "mio", "libc"]);
    }

    #[test]
    fn a_renamed_dependency_is_its_real_package() {
        let inline = "[dependencies]\njson = { version = \"1\", package = \"tokio\" }\n";
        assert_eq!(dependencies(inline, ""), ["tokio"]);
        let dotted = "[dependencies]\njson.version = \"1\"\njson.package = \"tokio\"\n";
        assert_eq!(dependencies(dotted, ""), ["tokio"]);
        let table = "[target.'cfg(unix)'.dependencies.json]\npackage = \"tokio\"\nversion = \"1\"\n";
        assert_eq!(dependencies(table, ""), ["tokio"]);
        let not_a_rename = "[dependencies]\njson = { path = \"../package\" }\n";
        assert_eq!(dependencies(not_a_rename, ""), ["json"]);
        let two_tables =
            "[target.'cfg(any())'.dependencies]\njson = { package = \"serde\" }\n[dependencies]\njson = \"1\"\n";
        assert_eq!(dependencies(two_tables, ""), ["serde", "json"]);
    }

    #[test]
    fn an_inherited_dependency_is_what_the_workspace_renames_it_to() {
        let root = "[workspace.dependencies]\nserde_json = { version = \"1\", package = \"tokio\" }\nserde = \"1\"\n";
        assert_eq!(
            dependencies("[dependencies]\nserde_json.workspace = true\nserde.workspace = true\n", root),
            ["tokio", "serde"]
        );
        assert_eq!(dependencies("[dependencies]\nserde_json = { workspace = true }\n", root), ["tokio"]);
        assert_eq!(dependencies("[dependencies]\nserde_json = \"1\"\n", root), ["serde_json"]);
    }

    #[test]
    fn a_renamed_package_is_checked_by_its_real_name() {
        let world = format!("[dependencies]\nserde = {{ version = \"1\", package = \"tokio\" }}\n{LINTS}");
        let found = check(&manifests(&[("crates/world/Cargo.toml", world.as_str())]));
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].message, "world may not depend on the outside crate \"tokio\"");
    }

    #[test]
    fn a_crate_must_take_the_workspace_lints() {
        let found = check(&manifests(&[("crates/world/Cargo.toml", "[dependencies]\n")]));
        assert_eq!(found.len(), 1);
        assert!(found[0].message.contains("workspace's lints"));
        let off = check(&manifests(&[("crates/world/Cargo.toml", "[lints]\nworkspace = false\n")]));
        assert_eq!(off.len(), 1);
        let elsewhere = check(&manifests(&[("crates/world/Cargo.toml", "[lints.rust]\nworkspace = true\n")]));
        assert_eq!(elsewhere.len(), 1);
        assert!(check(&manifests(&[("crates/world/Cargo.toml", LINTS)])).is_empty());
    }

    #[test]
    fn allowed_dependencies_pass() {
        let found = check(&manifests(&[
            ("crates/world/Cargo.toml", format!("[dependencies]\nserde.workspace = true\n{LINTS}").as_str()),
            ("crates/xtask/Cargo.toml", format!("[dependencies]\nworld = {{ path = \"../world\" }}\n{LINTS}").as_str()),
        ]));
        assert!(found.is_empty(), "{found:?}");
    }

    #[test]
    fn the_rules_crate_may_not_reach_a_platform_or_another_crate() {
        let found = check(&manifests(&[
            (
                "crates/world/Cargo.toml",
                format!("[dependencies]\ntokio = \"1\"\nxtask = {{ path = \"../xtask\" }}\n{LINTS}").as_str(),
            ),
            ("crates/xtask/Cargo.toml", LINTS),
        ]));
        let messages: Vec<&str> = found.iter().map(|problem| problem.message.as_str()).collect();
        assert_eq!(
            messages,
            ["world may not depend on the outside crate \"tokio\"", "world may not depend on the crate \"xtask\""]
        );
    }

    #[test]
    fn only_a_door_crate_may_allow_unsafe_code() {
        let sources = manifests(&[
            ("crates/world-wasm/src/lib.rs", "#![allow(unsafe_code, reason = \"door\")]"),
            ("crates/world/src/lib.rs", "#![allow(unsafe_code)]"),
        ]);
        let found = check_unsafe(&sources);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].file, "crates/world/src/lib.rs");
    }

    #[test]
    fn unsafe_code_is_caught_in_every_attribute_form() {
        let cases = [
            "#![expect(unsafe_code, reason = \"x\")]\n",
            "#![allow(unused, unsafe_code)]\n",
            "#![cfg_attr(all(), allow(unsafe_code))]\n",
            "#![allow(\n    unused,\n    unsafe_code,\n)]\n",
            "fn sail() {\n    #[allow(reason = \"a ] in a string\", unsafe_code)]\n    let speed = 1;\n}\n",
        ];
        for case in cases {
            let found = check_unsafe(&manifests(&[("crates/world/src/lib.rs", case)]));
            assert_eq!(found.len(), 1, "{case}");
        }
    }

    #[test]
    fn other_attributes_and_mentions_of_unsafe_code_pass() {
        let text = "#![allow(unused)]\n#[derive(Debug)]\nstruct Hull;\n// unsafe_code is denied\nconst NAME: &str = \"unsafe_code\";\n";
        assert!(check_unsafe(&manifests(&[("crates/world/src/lib.rs", text)])).is_empty());
    }

    #[test]
    fn an_undeclared_crate_is_a_problem() {
        let found = check(&manifests(&[("crates/sea/Cargo.toml", LINTS)]));
        assert_eq!(found.len(), 1);
        assert!(found[0].message.contains("not declared"));
    }
}
