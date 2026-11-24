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
        ["code: crates/core/src/wind.rs defines no \"calm\"", "code: crates/core/src/gone.rs does not exist"]
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

#[test]
fn a_symbol_is_found_where_each_language_defines_it() {
    let rust = "pub(crate) fn gust() {}\nstruct Calm;\npub const GALE: u8 = 1;\nenum Wind {\n    Squall,\n    Breeze(f32),\n}\nstruct Sail {\n    pub reef: u8,\n}\nmacro_rules! blow { () => {} }\n";
    for symbol in ["gust", "Calm", "GALE", "Wind", "Squall", "Breeze", "reef", "blow"] {
        assert!(holds_symbol("crates/core/src/wind.rs", rust, symbol), "{symbol}");
    }
    let script = "export async function gust() {}\nexport const GALE = 1;\nexport interface Calm {\n  readonly reef?: number;\n}\nclass Sail {\n  private trim(sheet: (to: number) => void): this {\n    return this;\n  }\n  get luff(): number {\n    return 0;\n  }\n  static hoist<T>(\n    sail: T,\n  ) {}\n}\n";
    for symbol in ["gust", "GALE", "Calm", "reef", "trim", "luff", "hoist"] {
        assert!(holds_symbol("client/src/wind.ts", script, symbol), "{symbol}");
    }
    let python = "def gust():\n    pass\nclass Calm:\n    reef = 1\nGALE: int = 2\n";
    for symbol in ["gust", "Calm", "reef", "GALE"] {
        assert!(holds_symbol("tools/wind.py", python, symbol), "{symbol}");
    }
    assert!(holds_symbol("content/wind.json", "{ \"gust\": 1 }", "gust"), "a file of no language: named anywhere");
}

#[test]
fn a_symbol_only_imported_called_or_commented_on_is_not_defined() {
    let rust = "use crate::wind::{\n    gust,\n    Calm,\n};\n// GALE is the sea's.\nfn sail() {\n    gust();\n    let reef = Calm::new();\n}\n";
    for symbol in ["gust", "Calm", "GALE", "new"] {
        assert!(!holds_symbol("crates/core/src/sail.rs", rust, symbol), "{symbol}");
    }
    let script = "import {\n  gust,\n  type Calm,\n} from './wind.ts';\nimport { GALE } from './gale.ts';\nexport { reef } from './reef.ts';\n/** trim is the sheet's. */\ntest('a sail', () => {\n  gust(1);\n});\n";
    for symbol in ["gust", "Calm", "GALE", "reef", "trim", "test"] {
        assert!(!holds_symbol("client/src/sail.ts", script, symbol), "{symbol}");
    }
    let python = "from wind import (\n    gust,\n    Calm,\n)\nimport gale  # reef\ngust()\n";
    for symbol in ["gust", "Calm", "gale", "reef"] {
        assert!(!holds_symbol("tools/sail.py", python, symbol), "{symbol}");
    }
}
