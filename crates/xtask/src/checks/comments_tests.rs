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
fn history_in_a_comment_is_a_problem() {
    let cases = [
        "// changed on 2026-11-14 for the patch\n",
        "// see #1674 for the reason\n",
        "// HOST-SPLIT: keeps the host small\n",
        "// WG2-EDIT keeps the layer\n",
        "// explained in bible/03-Code/Sea.md\n",
    ];
    for case in cases {
        assert_eq!(problems_in("crates/core/src/lib.rs", case).len(), 1, "{case}");
    }
}

#[test]
fn ordinary_words_are_not_history() {
    let cases = [
        "// UTF-8 text, SHA-256 prints, a 2D grid, item #1 of a list\n",
        "// The hull rolls at 0.5 rad and 20 Hz; see the Sailing note.\n",
        "// x-axis and y-axis meet at the keel.\n",
    ];
    for case in cases {
        assert!(problems_in("crates/core/src/lib.rs", case).is_empty(), "{case}");
    }
}

#[test]
fn python_comments_follow_the_same_rules() {
    let text = format!("{}x = 1\n# HULL-FIT tag\n", "# why\n".repeat(MAX_COMMENT_LINES + 1));
    let problems = problems_in("forge/body.py", &text);
    assert_eq!(problems.len(), 2);
}
