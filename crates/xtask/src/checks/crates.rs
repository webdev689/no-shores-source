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
    CrateRule { name: "xtask", workspace: &["*"], outside: &["*"], door: false },
];

/// The crates a manifest depends on at run time: its `[dependencies]` table, each `[dependencies.<name>]` table, and
/// the per-platform `[target.<platform>.dependencies]` tables a WebAssembly build would use.
pub fn dependencies(manifest: &str) -> Vec<String> {
    let mut in_dependencies = false;
    let mut names = Vec::new();
    for line in manifest.lines().map(str::trim) {
        if line.starts_with('[') {
            let header = line.trim_start_matches('[').trim_end_matches(']');
            if let Some(name) = header.strip_prefix("dependencies.") {
                names.push(name.trim_matches('"').to_owned());
            }
            in_dependencies =
                header == "dependencies" || (header.starts_with("target.") && header.ends_with(".dependencies"));
            continue;
        }
        if !in_dependencies || line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, _)) = line.split_once('=') {
            let name = key.trim().split('.').next().unwrap_or_default().trim_matches('"');
            if !name.is_empty() {
                names.push(name.to_owned());
            }
        }
    }
    names
}

fn allows(list: &[&str], name: &str) -> bool {
    list.contains(&"*") || list.contains(&name)
}

/// Whether a source file carries an attribute allowing unsafe code, at the start of a line.
fn allows_unsafe(text: &str) -> bool {
    text.lines()
        .map(str::trim_start)
        .any(|line| line.starts_with("#![allow(unsafe_code") || line.starts_with("#[allow(unsafe_code"))
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

/// Every crate is declared, and depends only on what its rule allows.
pub fn check(manifests: &[(String, String)]) -> Vec<Problem> {
    let workspace: Vec<&str> =
        manifests.iter().filter_map(|(path, _)| path.strip_prefix("crates/")?.strip_suffix("/Cargo.toml")).collect();
    let mut problems = Vec::new();
    for (path, text) in manifests {
        let Some(name) = path.strip_prefix("crates/").and_then(|rest| rest.strip_suffix("/Cargo.toml")) else {
            continue;
        };
        let Some(rule) = CRATES.iter().find(|rule| rule.name == name) else {
            let message = format!("crate \"{name}\" is not declared: add it to CRATES and the Code Map");
            problems.push(Problem::new("crates", path, None, message));
            continue;
        };
        for dependency in dependencies(text) {
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

    fn manifests(list: &[(&str, &str)]) -> Vec<(String, String)> {
        list.iter().map(|(path, text)| ((*path).to_owned(), (*text).to_owned())).collect()
    }

    #[test]
    fn dependencies_are_read_in_every_form() {
        let text = "[package]\nname = \"x\"\n[dependencies]\nserde.workspace = true\nserde_json = \"1\"\nworld = { path = \"../world\" }\n# note\n[dev-dependencies]\nproptest = \"1\"\n";
        assert_eq!(dependencies(text), ["serde", "serde_json", "world"]);
    }

    #[test]
    fn a_dependency_table_or_a_platform_table_still_counts() {
        let text = "[dependencies.tokio]\nversion = \"1\"\n[target.'cfg(target_arch = \"wasm32\")'.dependencies]\nweb-sys = \"0.3\"\n[build-dependencies]\ncc = \"1\"\n";
        assert_eq!(dependencies(text), ["tokio", "web-sys"]);
    }

    #[test]
    fn allowed_dependencies_pass() {
        let found = check(&manifests(&[
            ("crates/world/Cargo.toml", "[dependencies]\nserde.workspace = true\n"),
            ("crates/xtask/Cargo.toml", "[dependencies]\nworld = { path = \"../world\" }\n"),
        ]));
        assert!(found.is_empty(), "{found:?}");
    }

    #[test]
    fn the_rules_crate_may_not_reach_a_platform_or_another_crate() {
        let found = check(&manifests(&[
            ("crates/world/Cargo.toml", "[dependencies]\ntokio = \"1\"\nxtask = { path = \"../xtask\" }\n"),
            ("crates/xtask/Cargo.toml", "[dependencies]\n"),
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
    fn an_undeclared_crate_is_a_problem() {
        let found = check(&manifests(&[("crates/sea/Cargo.toml", "[dependencies]\n")]));
        assert_eq!(found.len(), 1);
        assert!(found[0].message.contains("not declared"));
    }
}
