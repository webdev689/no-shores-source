use super::*;

fn problems_in(path: &str, text: &str) -> Vec<Problem> {
    check(&[(path.to_owned(), text.to_owned())])
}

#[test]
fn consecutive_line_comments_form_one_comment() {
    let text = "// one\n// two\nfn sail() {}\n// three\n";
    let comments = rust_comments(text);
    assert_eq!(comments.len(), 2);
    assert_eq!(comments[0].lines, vec![(1, " one".to_owned()), (2, " two".to_owned())]);
    assert_eq!(comments[1].lines, vec![(4, " three".to_owned())]);
}

#[test]
fn a_trailing_comment_stands_alone() {
    let text = "// above\nlet wind = 3; // beside\n// below\n";
    assert_eq!(rust_comments(text).len(), 3);
}

#[test]
fn strings_raw_strings_and_characters_are_not_comments() {
    let text = r##"let url = "https://example.com"; let raw = r#"a // b "quoted""#; let slash = '/'; let tick = '\''; let life: &'static str = "";
// real
"##;
    let comments = rust_comments(text);
    assert_eq!(comments.len(), 1);
    assert_eq!(comments[0].lines[0].0, 2);
}

#[test]
fn block_comments_nest_and_keep_their_lines() {
    let text = "/* outer /* inner */ still outer\n second line */\nfn helm() {}\n";
    let comments = rust_comments(text);
    assert_eq!(comments.len(), 1);
    assert_eq!(comments[0].lines.len(), 2);
    assert_eq!(comments[0].lines[1].0, 2);
}

#[test]
fn eight_lines_pass_and_nine_do_not() {
    let eight = "/// why\n".repeat(MAX_COMMENT_LINES);
    assert!(problems_in("crates/core/src/lib.rs", &eight).is_empty());
    let nine = "/// why\n".repeat(MAX_COMMENT_LINES + 1);
    let problems = problems_in("crates/core/src/lib.rs", &nine);
    assert_eq!(problems.len(), 1);
    assert_eq!(problems[0].line, Some(1));
}

#[test]
fn a_doc_example_does_not_count_toward_the_limit() {
    let text = format!("/// why\n/// ```\n{}/// ```\n", "/// let speed = 2;\n".repeat(20));
    assert!(problems_in("crates/core/src/lib.rs", &text).is_empty());
}

#[test]
fn an_unclosed_example_counts_toward_the_limit() {
    let text = format!("/// why\n/// ```\n{}", "/// let speed = 2;\n".repeat(MAX_COMMENT_LINES));
    let problems = problems_in("crates/core/src/lib.rs", &text);
    assert_eq!(problems.len(), 1);
    assert!(problems[0].message.contains("9-line comment"));
}

#[test]
fn history_inside_an_example_is_still_a_problem() {
    let text = "/// why\n/// ```\n/// let fixed = 1; // see #1674\n/// ```\n";
    let problems = problems_in("crates/core/src/lib.rs", text);
    assert_eq!(problems.len(), 1);
    assert_eq!(problems[0].line, Some(3));
}

#[test]
fn every_script_extension_is_read_as_a_script() {
    let text = "const page = `\n// see #1674\n`;\n";
    assert_eq!(problems_in("crates/core/src/lib.rs", text).len(), 1);
    for path in ["client/src/a.mts", "client/src/a.cts", "client/src/a.tsx", "client/src/a.mjs", "client/src/a.cjs"] {
        assert!(problems_in(path, text).is_empty(), "{path}");
    }
}

#[test]
fn a_comment_that_links_or_names_a_note_is_a_problem() {
    let cases = [
        "// as [[Sailing]] says, the helm turns\n",
        "/// The waves rise (`Water.md` \"Swell\")\n",
        "// see Comments Say Why.md\n",
        "# the forge's rule, Sprite Forge.md\n",
        "// The hull rolls at 0.5 rad; see the Sailing note.\n",
        "/// as its entry in the Code Map note.\n",
        "// what is fitted to her is in the bible's Modules note\n",
        "// as Hand-off.md says\n",
        "// Lessons from DFO.md\n",
    ];
    for case in cases {
        let path = if case.starts_with('#') { "tools/forge.py" } else { "crates/core/src/lib.rs" };
        assert_eq!(problems_in(path, case).len(), 1, "{case}");
    }
}

#[test]
fn a_wiki_link_in_inline_code_or_a_shouting_file_is_no_note() {
    let cases = [
        "/// Links read as `[[Note]]` and `[[Note|shown]]`\n",
        "// as README.md and CLAUDE.md say\n",
        "/// One note: when, on which channel, its key\n",
        "// Each note is built from the FM bank, and the note wraps where the room is narrow\n",
        "/** Whether `note` was merged since the player last pressed Play. */\n",
        "/// \"borders\": [[a, b]], \"path\": [[x, y]]\n",
    ];
    for case in cases {
        assert!(problems_in("crates/core/src/lib.rs", case).is_empty(), "{case}");
    }
}

#[test]
fn history_in_a_comment_is_a_problem() {
    let cases = [
        "// changed on 2026-11-14 for the patch\n",
        "// see #1674 for the reason\n",
        "// HOST-SPLIT: keeps the host small\n",
        "// WG2-EDIT keeps the layer\n",
        "// explained in bible/03-Code/Sea.md\n",
        "// see PR#1674 for the reason\n",
        "// GH-1674, as JIRA-2210 asked\n",
        "// NAV-12 keeps the helm\n",
        "// changed on 17 Nov 2026\n",
        "// changed on 3 September 2026\n",
        "// changed on 2026/11/14\n",
        "// changed on November 17, 2026\n",
        "// fixed in PR 1674\n",
    ];
    for case in cases {
        assert_eq!(problems_in("crates/core/src/lib.rs", case).len(), 1, "{case}");
    }
}

#[test]
fn ordinary_words_are_not_history() {
    let cases = [
        "// UTF-8 text, SHA-256 prints, a 2D grid, item #1 of a list\n",
        "// The hull rolls at 0.5 rad and 20 Hz, at sea.\n",
        "// x-axis and y-axis meet at the keel.\n",
        "// ISO-8601 times, RFC-3339 stamps, May 2026's swell, 3 maybe 2026 ships\n",
        "// the GPU may issue 64 draws a frame\n",
    ];
    for case in cases {
        assert!(problems_in("crates/core/src/lib.rs", case).is_empty(), "{case}");
    }
}

#[test]
fn python_docstrings_and_trailing_comments_are_read() {
    let text = "def sail():\n    \"\"\"Changed on 2026-11-14,\n    see #1674.\"\"\"\n    x = '#1674'  # LOOT-GATE\n";
    let lines: Vec<usize> = problems_in("forge/body.py", text).iter().filter_map(|problem| problem.line).collect();
    assert_eq!(lines, [2, 3, 4], "the docstring's two lines and the trailing comment, not the string");
    let long = format!("\"\"\"{}\"\"\"\n", "why\n".repeat(MAX_COMMENT_LINES + 1));
    assert_eq!(problems_in("forge/body.py", &long).len(), 1, "a long docstring is a long comment");
}

#[test]
fn raw_and_one_line_docstrings_are_read_but_an_assigned_string_is_not() {
    let raw = "def match():\n    r\"\"\"Changed on 2026-11-14.\"\"\"\n";
    assert_eq!(problems_in("forge/body.py", raw).len(), 1, "a raw docstring");
    let one_line = "def sail(x: int) -> dict[str, int]: \"\"\"Fixed in #1674.\"\"\"\n";
    assert_eq!(problems_in("forge/body.py", one_line).len(), 1, "a docstring after a one-line header");
    let class = "class Hull(Base): '''See #1674.'''\n";
    assert_eq!(problems_in("forge/body.py", class).len(), 1, "a class's");
    let assigned = "TEXT = \"\"\"Changed on 2026-11-14.\"\"\"\n";
    assert!(problems_in("forge/body.py", assigned).is_empty(), "a string assigned is data, not a comment");
}

#[test]
fn python_comments_follow_the_same_rules() {
    let text = format!("{}x = 1\n# HULL-FIT tag\n", "# why\n".repeat(MAX_COMMENT_LINES + 1));
    let problems = problems_in("forge/body.py", &text);
    assert_eq!(problems.len(), 2);
}
