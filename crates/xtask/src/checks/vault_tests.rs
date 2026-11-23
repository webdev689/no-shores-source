use super::*;

fn files(list: &[&str]) -> Vec<String> {
    list.iter().map(|path| (*path).to_owned()).collect()
}

fn note(path: &str, text: &str) -> Vec<(String, String)> {
    vec![(path.to_owned(), text.to_owned())]
}

#[test]
fn links_name_their_target_before_alias_heading_or_block() {
    let text = "See [[Sailing]], [[Sailing|the sails]], [[Sailing#Wind]] and ![[hull.png]].";
    let targets: Vec<String> = wikilinks_of(text).into_iter().map(|link| link.target).collect();
    assert_eq!(targets, ["Sailing", "Sailing", "Sailing", "hull.png"]);
}

#[test]
fn links_in_code_are_not_links() {
    let text = "`[[Not a link]]`\n```\n[[Also not]]\n```\n[[Real]]\n";
    let links = wikilinks_of(text);
    assert_eq!(links, vec![Link { target: "Real".to_owned(), line: 5, split: false }]);
}

#[test]
fn links_resolve_by_name_by_path_and_attachments_by_file_name() {
    let vault = files(&["bible/02-Systems/Sailing.md", "bible/Attachments/hull.png", "bible/Home.md"]);
    let text = "[[Sailing]] [[02-Systems/Sailing]] ![[hull.png]] [[Home]]";
    assert!(check(&note("bible/Home.md", text), &vault, |_| None).is_empty());
}

#[test]
fn a_link_to_no_note_is_a_problem() {
    let vault = files(&["bible/Home.md"]);
    let problems = check(&note("bible/Home.md", "line one\n[[Missing]]\n"), &vault, |_| None);
    assert_eq!(problems.len(), 1);
    assert_eq!(problems[0].line, Some(2));
    assert!(problems[0].message.contains("[[Missing]]"));
}

#[test]
fn code_refs_are_read_from_the_front_matter_only() {
    let text = "---\ntype: system\ncode:\n  - crates/core/src/wind.rs#gust\n  - \"crates/core/src/lib.rs\"\nstatus: live\n---\ncode:\n  - not/front/matter.rs\n";
    let refs: Vec<String> = code_refs_of(text).into_iter().map(|link| link.target).collect();
    assert_eq!(refs, ["crates/core/src/wind.rs#gust", "crates/core/src/lib.rs"]);
}

#[test]
fn code_refs_must_exist_and_hold_their_symbol() {
    let text = "---\ncode:\n  - crates/core/src/wind.rs#gust\n  - crates/core/src/wind.rs#calm\n  - crates/core/src/gone.rs\n---\n";
    let read = |path: &str| {
        (path == "crates/core/src/wind.rs").then(|| "pub fn gust_strength() {}\npub fn gust() {}".to_owned())
    };
    let problems = check(&note("bible/Home.md", text), &files(&["bible/Home.md"]), read);
    let messages: Vec<&str> = problems.iter().map(|problem| problem.message.as_str()).collect();
    assert_eq!(
        messages,
        ["code: crates/core/src/wind.rs has no \"calm\"", "code: crates/core/src/gone.rs does not exist"]
    );
}

#[test]
fn a_symbol_matches_only_as_a_whole_name() {
    assert!(contains_word("fn gust() {}", "gust"));
    assert!(!contains_word("fn gust_strength() {}", "gust"));
}

#[test]
fn a_link_broken_across_two_lines_is_a_problem_obsidian_resolves_none() {
    let vault = files(&["bible/02-Systems/Sailing.md", "bible/Home.md"]);
    let text = "As the [[Sailing]] note says ([[Players Arrive as\nDestiny's Transmat Does]]), and `[[not code\n`.";
    let problems = check(&note("bible/Home.md", text), &vault, |_| None);
    assert_eq!(problems.len(), 1, "{problems:?}");
    assert_eq!(problems[0].line, Some(1));
    assert!(problems[0].message.contains("breaks across lines"), "{}", problems[0].message);
}
