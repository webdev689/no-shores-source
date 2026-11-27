//! `cargo xtask decisions`: the owner's decisions over the code a change touches, printed before the change is made,
//! so the ratios and laws they set are read while tuning, not found while writing the note afterwards. A changed file
//! leads to each note whose `code:` names it, and that note to the decision notes it links.

use crate::checks::vault::{VAULT_ROOT, code_refs_of, wikilinks_of};
use crate::files::{Repo, repo_root};
use std::collections::BTreeMap;
use std::process::Command;

/// Where the owner's decisions are kept, one note each.
const DECISIONS: &str = "bible/05-Decisions/";

/// Each decision note the notes over the changed files link, by its title, with the notes that led to it.
pub fn decisions_for(
    changed: &[String],
    notes: &[(String, String)],
    files: &[String],
) -> BTreeMap<String, Vec<String>> {
    let mut found: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (path, text) in notes {
        let covers = |changed: &String| {
            code_refs_of(text).iter().any(|code| {
                let named = code.target.split('#').next().unwrap_or_default().trim_end_matches('/');
                !named.is_empty() && (changed == named || changed.starts_with(&format!("{named}/")))
            })
        };
        if !changed.iter().any(covers) {
            continue;
        }
        let title = path.rsplit('/').next().unwrap_or(path).trim_end_matches(".md");
        for link in wikilinks_of(text) {
            let decision = format!("{DECISIONS}{}.md", link.target);
            if files.contains(&decision) {
                let notes = found.entry(link.target).or_default();
                if !notes.iter().any(|note| note == title) {
                    notes.push(title.to_owned());
                }
            }
        }
    }
    found
}

/// The files changed against `base` (`origin/main` unless named): committed since they parted, uncommitted, and new.
fn changed(base: &str) -> Result<Vec<String>, String> {
    let mut changed = Vec::new();
    let since = format!("{base}...HEAD");
    for args in [
        &["diff", "--name-only", &since][..],
        &["diff", "--name-only", "HEAD"],
        &["ls-files", "--others", "--exclude-standard"],
    ] {
        let output = Command::new("git")
            .args(args)
            .current_dir(repo_root())
            .output()
            .map_err(|error| format!("git diff: {error}"))?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
        }
        changed.extend(String::from_utf8_lossy(&output.stdout).lines().map(str::to_owned));
    }
    changed.sort();
    changed.dedup();
    Ok(changed)
}

/// Prints the decisions over the files changed against `base`; false when the change could not be read.
pub fn report(base: &str) -> bool {
    let (changed, repo) = match (changed(base), Repo::load()) {
        (Ok(changed), Ok(repo)) => (changed, repo),
        (Err(error), _) | (_, Err(error)) => {
            println!("decisions: the change could not be read: {error}");
            return false;
        }
    };
    let (notes, _) = repo.sources(|path| path.starts_with(VAULT_ROOT) && path.ends_with(".md"));
    let found = decisions_for(&changed, &notes, &repo.files);
    if found.is_empty() {
        println!("decisions: none over the {} file(s) changed against {base}", changed.len());
    }
    for (decision, notes) in &found {
        println!("{DECISIONS}{decision}.md  (from {})", notes.join(", "));
    }
    true
}

#[cfg(test)]
mod tests {
    use super::decisions_for;

    fn note(code: &str, body: &str) -> String {
        format!("---\ntype: system\ncode:\n  - {code}\n---\n# Note\n\n{body}\n")
    }

    #[test]
    fn a_changed_file_leads_to_the_decisions_its_notes_link() {
        let notes = [
            (
                "bible/02-Systems/Ranged.md".to_owned(),
                note("crates/combat/src/shots.rs#PLAYER_BOW", "[[Aim and Fire]]"),
            ),
            ("bible/02-Systems/Ships.md".to_owned(), note("crates/naval/src/", "[[Keep Square Broadsides|square]]")),
            ("bible/02-Systems/Sky.md".to_owned(), note("crates/sky/src/lib.rs", "[[A Day Lasts One Real Hour]]")),
        ];
        let files = [
            "bible/05-Decisions/Aim and Fire.md",
            "bible/05-Decisions/Keep Square Broadsides.md",
            "bible/05-Decisions/A Day Lasts One Real Hour.md",
        ]
        .map(str::to_owned);
        let changed = ["crates/combat/src/shots.rs", "crates/naval/src/captain/aim.rs"].map(str::to_owned);
        let found = decisions_for(&changed, &notes, &files);
        assert_eq!(found.keys().collect::<Vec<_>>(), ["Aim and Fire", "Keep Square Broadsides"]);
        assert_eq!(found["Keep Square Broadsides"], ["Ships"]);
    }

    #[test]
    fn a_link_to_a_note_that_is_no_decision_is_not_printed() {
        let notes = [("bible/02-Systems/Ranged.md".to_owned(), note("crates/combat/src/shots.rs", "[[Combat]]"))];
        let files = ["bible/02-Systems/Combat.md".to_owned()];
        assert!(decisions_for(&["crates/combat/src/shots.rs".to_owned()], &notes, &files).is_empty());
    }
}
