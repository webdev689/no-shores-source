use super::Problem;

/// Everything allowed at the top of the repository. A new top-level folder is a decision: add it here and to the
/// Code Map note in the same change.
pub const TOP_LEVEL: [&str; 25] = [
    ".cargo",
    ".editorconfig",
    ".gitattributes",
    ".github",
    ".gitignore",
    ".prettierignore",
    ".prettierrc.json",
    "CLAUDE.md",
    "Cargo.lock",
    "Cargo.toml",
    "LICENSE",
    "README.md",
    "bible",
    "client",
    "clippy.toml",
    "crates",
    "eslint.config.js",
    "package-lock.json",
    "package.json",
    "rust-toolchain.toml",
    "rustfmt.toml",
    "tools",
    "tsconfig.json",
    "tsconfig.node.json",
    "vite.config.ts",
];

/// Where files may live, and that every folder under `crates/` is a crate named after its folder.
pub fn check(files: &[String], read: impl Fn(&str) -> Option<String>) -> Vec<Problem> {
    let mut problems = Vec::new();
    let mut crate_folders: Vec<&str> = Vec::new();
    for file in files {
        let top = file.split('/').next().unwrap_or_default();
        if !TOP_LEVEL.contains(&top) {
            problems.push(Problem::new(
                "layout",
                file,
                None,
                format!("\"{top}\" is not a known top-level entry (crates/xtask/src/checks/layout.rs)"),
            ));
        }
        if let Some((folder, _)) = file.strip_prefix("crates/").and_then(|rest| rest.split_once('/'))
            && !crate_folders.contains(&folder)
        {
            crate_folders.push(folder);
        }
    }
    for folder in crate_folders {
        let manifest = format!("crates/{folder}/Cargo.toml");
        match read(&manifest).as_deref().and_then(package_name) {
            None => problems.push(Problem::new("layout", &manifest, None, "every folder under crates/ is a crate")),
            Some(name) if name != folder => problems.push(Problem::new(
                "layout",
                &manifest,
                None,
                format!("the crate is named \"{name}\": name it after its folder, \"{folder}\""),
            )),
            Some(_) => {}
        }
    }
    problems
}

/// The `name` under `[package]` in a Cargo manifest.
fn package_name(manifest: &str) -> Option<String> {
    let mut in_package = false;
    for line in manifest.lines().map(str::trim) {
        if line.starts_with('[') {
            in_package = line == "[package]";
        } else if in_package && let Some(value) = line.strip_prefix("name") {
            let value = value.trim_start().strip_prefix('=')?.trim();
            return Some(value.trim_matches('"').to_owned());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths(list: &[&str]) -> Vec<String> {
        list.iter().map(|path| (*path).to_owned()).collect()
    }

    #[test]
    fn known_top_level_entries_pass() {
        let files = paths(&["README.md", "bible/Home.md", "crates/core/Cargo.toml", "crates/core/src/lib.rs"]);
        let problems = check(&files, |_| Some("[package]\nname = \"core\"\n".to_owned()));
        assert!(problems.is_empty(), "{problems:?}");
    }

    #[test]
    fn an_unknown_top_level_entry_is_a_problem() {
        let problems = check(&paths(&["index.html", "scripts/deploy.sh"]), |_| None);
        assert_eq!(problems.len(), 2);
        assert!(problems[0].message.contains("index.html"));
    }

    #[test]
    fn a_crate_named_unlike_its_folder_is_a_problem() {
        let files = paths(&["crates/sea/Cargo.toml", "crates/sea/src/lib.rs"]);
        let problems = check(&files, |_| Some("[package]\nname = \"ocean\"\n".to_owned()));
        assert_eq!(problems.len(), 1);
        assert!(problems[0].message.contains("\"sea\""));
    }

    #[test]
    fn a_folder_under_crates_without_a_manifest_is_a_problem() {
        let problems = check(&paths(&["crates/loose/notes.txt"]), |_| None);
        assert_eq!(problems.len(), 1);
        assert!(problems[0].message.contains("is a crate"));
    }

    #[test]
    fn package_name_reads_only_the_package_table() {
        let manifest = "[dependencies]\nname = \"wrong\"\n[package]\nname = \"right\"\nversion = \"0.0.0\"\n";
        assert_eq!(package_name(manifest).as_deref(), Some("right"));
    }
}
