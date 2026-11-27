use super::script_comments::script_comments;
use super::{Problem, is_script};

/// A comment says why in at most this many lines. Lines inside a doc comment's code example do not count.
pub const MAX_COMMENT_LINES: usize = 8;

/// One comment: each of its lines with its 1-based line number.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Comment {
    pub lines: Vec<(usize, String)>,
}

/// The comments of a Rust file. Strings, raw strings and character literals are skipped, so their contents are
/// never read as comments; consecutive `//` lines that stand alone form one comment.
pub fn rust_comments(text: &str) -> Vec<Comment> {
    let chars: Vec<char> = text.chars().collect();
    let mut comments: Vec<Comment> = Vec::new();
    let mut line = 1;
    let mut index = 0;
    let mut line_has_code = false;
    let mut last_standalone_line: Option<usize> = None;
    while index < chars.len() {
        let current = chars[index];
        let next = chars.get(index + 1).copied();
        if current == '\n' {
            line += 1;
            line_has_code = false;
            index += 1;
        } else if current == '/' && next == Some('/') {
            let end = chars[index..].iter().position(|&ch| ch == '\n').map_or(chars.len(), |offset| index + offset);
            let body: String = chars[index + 2..end].iter().collect();
            let standalone = !line_has_code;
            let continues = standalone && last_standalone_line.is_some_and(|previous| previous + 1 == line);
            match comments.last_mut() {
                Some(comment) if continues => comment.lines.push((line, body)),
                _ => comments.push(Comment { lines: vec![(line, body)] }),
            }
            last_standalone_line = standalone.then_some(line);
            index = end;
        } else if current == '/' && next == Some('*') {
            let (comment, end, lines_crossed) = block_comment(&chars, index, line);
            comments.push(comment);
            line += lines_crossed;
            last_standalone_line = None;
            line_has_code = true;
            index = end;
        } else if current == '"' {
            let (end, lines_crossed) = skip_string(&chars, index);
            line += lines_crossed;
            line_has_code = true;
            index = end;
        } else if let Some(hashes) = raw_string_start(&chars, index) {
            let (end, lines_crossed) = skip_raw_string(&chars, index, hashes);
            line += lines_crossed;
            line_has_code = true;
            index = end;
        } else if current == '\'' {
            line_has_code = true;
            index = skip_char_or_lifetime(&chars, index);
        } else {
            line_has_code |= !current.is_whitespace();
            index += 1;
        }
    }
    comments
}

/// The comments of a Python file: consecutive `#` lines that stand alone form one comment, a `#` after code is one
/// of its own, and so is a docstring (a statement that is only a `"""` or `'''` string).
pub fn python_comments(text: &str) -> Vec<Comment> {
    let mut comments: Vec<Comment> = Vec::new();
    let mut last_line = 0;
    let mut docstring: Option<(&str, Comment)> = None;
    for (offset, raw) in text.lines().enumerate() {
        let line = offset + 1;
        if let Some((quotes, mut open)) = docstring.take() {
            let closed = raw.contains(quotes);
            open.lines.push((line, raw.split(quotes).next().unwrap_or_default().to_owned()));
            if closed {
                comments.push(open)
            } else {
                docstring = Some((quotes, open))
            }
            continue;
        }
        if let Some((quotes, rest)) = docstring_opening(raw.trim_start()) {
            let opened = Comment { lines: vec![(line, rest.split(quotes).next().unwrap_or_default().to_owned())] };
            if rest.contains(quotes) {
                comments.push(opened)
            } else {
                docstring = Some((quotes, opened))
            }
            continue;
        }
        let Some(at) = python_comment_start(raw) else { continue };
        let body = raw[at + 1..].to_owned();
        let standalone = raw[..at].trim().is_empty();
        match comments.last_mut() {
            Some(comment) if standalone && last_line + 1 == line => comment.lines.push((line, body)),
            _ => comments.push(Comment { lines: vec![(line, body)] }),
        }
        last_line = if standalone { line } else { 0 };
    }
    comments.extend(docstring.map(|(_, open)| open));
    comments
}

/// The quotes a docstring opens with on a Python line (from its first letter) and the text after them: a statement
/// that is only a `"""` or `'''` string, raw or not, standing alone or after a one-line `def` or `class` header.
fn docstring_opening(code: &str) -> Option<(&'static str, &str)> {
    let statement = after_header(code).unwrap_or(code);
    let unprefixed = statement.strip_prefix(['r', 'R', 'u', 'U']).unwrap_or(statement);
    ["\"\"\"", "'''"].into_iter().find_map(|quotes| unprefixed.strip_prefix(quotes).map(|rest| (quotes, rest)))
}

/// What follows a `def` or `class` header's colon on its own line, its parameters' and annotations' colons passed.
fn after_header(code: &str) -> Option<&str> {
    let header = ["def ", "async def ", "class "].iter().any(|word| code.starts_with(word));
    let mut depth = 0_i32;
    for (at, ch) in code.char_indices().filter(|_| header) {
        match ch {
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => depth -= 1,
            ':' if depth == 0 => return Some(code[at + 1..].trim_start()),
            _ => {}
        }
    }
    None
}

/// Where a Python line's `#` comment starts, outside its quotes.
fn python_comment_start(line: &str) -> Option<usize> {
    let mut quote: Option<char> = None;
    let mut escaped = false;
    for (at, ch) in line.char_indices() {
        match (quote, ch) {
            (Some(_), '\\') if !escaped => escaped = true,
            (Some(open), _) if ch == open && !escaped => quote = None,
            (None, '\'' | '"') => quote = Some(ch),
            (None, '#') => return Some(at),
            _ => escaped = false,
        }
        if ch != '\\' {
            escaped = false;
        }
    }
    None
}

fn block_comment(chars: &[char], start: usize, start_line: usize) -> (Comment, usize, usize) {
    let mut depth = 1;
    let mut position = start + 2;
    let mut body = String::new();
    while position < chars.len() && depth > 0 {
        let pair = (chars[position], chars.get(position + 1).copied());
        if pair == ('/', Some('*')) {
            depth += 1;
            position += 2;
        } else if pair == ('*', Some('/')) {
            depth -= 1;
            position += 2;
        } else {
            body.push(chars[position]);
            position += 1;
        }
    }
    let lines: Vec<(usize, String)> =
        body.split('\n').enumerate().map(|(offset, text)| (start_line + offset, text.to_owned())).collect();
    let crossed = lines.len() - 1;
    (Comment { lines }, position, crossed)
}

fn skip_string(chars: &[char], start: usize) -> (usize, usize) {
    let mut position = start + 1;
    let mut crossed = 0;
    while position < chars.len() {
        match chars[position] {
            '\\' => position += 1,
            '\n' => crossed += 1,
            '"' => return (position + 1, crossed),
            _ => {}
        }
        position += 1;
    }
    (position, crossed)
}

/// At `r"`, `r#"`, `br"` or `br#"` (not inside a name), the number of `#` marks; otherwise `None`.
fn raw_string_start(chars: &[char], index: usize) -> Option<usize> {
    let after_prefix = match (chars.get(index), chars.get(index + 1)) {
        (Some('r'), _) => index + 1,
        (Some('b'), Some('r')) => index + 2,
        _ => return None,
    };
    if index > 0 && (chars[index - 1].is_alphanumeric() || chars[index - 1] == '_') {
        return None;
    }
    let hashes = chars[after_prefix..].iter().take_while(|&&ch| ch == '#').count();
    (chars.get(after_prefix + hashes) == Some(&'"')).then_some(hashes)
}

fn skip_raw_string(chars: &[char], start: usize, hashes: usize) -> (usize, usize) {
    let open_quote = chars[start..].iter().position(|&ch| ch == '"').map_or(chars.len(), |offset| start + offset);
    let mut position = open_quote + 1;
    let mut crossed = 0;
    while position < chars.len() {
        if chars[position] == '\n' {
            crossed += 1;
        } else if chars[position] == '"'
            && chars[position + 1..].iter().take(hashes).filter(|&&ch| ch == '#').count() == hashes
        {
            return (position + 1 + hashes, crossed);
        }
        position += 1;
    }
    (position, crossed)
}

/// `'x'`, `'\n'` and `'\u{1F30A}'` are characters; `'a` in `&'a str` is a lifetime.
fn skip_char_or_lifetime(chars: &[char], start: usize) -> usize {
    if chars.get(start + 1) == Some(&'\\') {
        let after_escape = (start + 3).min(chars.len());
        let close = chars[after_escape..].iter().position(|&ch| ch == '\'');
        return close.map_or(start + 1, |offset| after_escape + offset + 1);
    }
    if chars.get(start + 2) == Some(&'\'') { start + 3 } else { start + 1 }
}

/// A comment line's words, without its `*`, `/` (for `///`) or `!` (for `//!`) lead.
fn words_of(body: &str) -> &str {
    body.trim_start().trim_start_matches(['/', '!', '*']).trim()
}

/// History belongs in git and pull requests. These mark it in a comment.
fn history_marker(words: &str) -> Option<&'static str> {
    if has_date(words) {
        Some("a date")
    } else if has_issue_number(words) {
        Some("a pull request or issue number")
    } else if has_ticket_tag(words) {
        Some("a ticket tag")
    } else if words.contains("bible/") || names_a_note(words) {
        Some("a pointer into the bible (pages move; the note links to the code, not the other way)")
    } else {
        None
    }
}

/// A wiki link to a note outside inline code (a note's name starts with a capital, unlike a nested list's numbers),
/// or a note's file by its name: a markdown file whose name starts with a capital but is not all capitals, as the
/// readme's is.
fn names_a_note(words: &str) -> bool {
    let linked = words.split('`').step_by(2).any(|outside| {
        outside
            .match_indices("[[")
            .any(|(at, _)| outside[at + 2..].chars().next().is_some_and(|ch| ch.is_ascii_uppercase()))
    });
    let named = words.match_indices(".md").any(|(at, _)| {
        let after_clear = words[at + 3..].chars().next().is_none_or(|next| !next.is_ascii_alphanumeric());
        let stem: String = words[..at].chars().rev().take_while(|ch| ch.is_ascii_alphanumeric()).collect();
        let first = stem.chars().last();
        after_clear && first.is_some_and(|ch| ch.is_ascii_uppercase()) && stem.chars().any(|ch| ch.is_ascii_lowercase())
    });
    linked || named
}

const MONTHS: [&str; 12] = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
];

/// A year, month and day joined by hyphens or slashes, or a day, a month's name and a year in either order.
fn has_date(words: &str) -> bool {
    let bytes = words.as_bytes();
    let numbered = [b"20dd-dd-dd", b"20dd/dd/dd"].iter().any(|shape| {
        bytes.windows(shape.len()).enumerate().any(|(start, window)| {
            let fits = window.iter().zip(*shape).all(|(&got, &want)| match want {
                b'd' => got.is_ascii_digit(),
                other => got == other,
            });
            let clear_before = start == 0 || !bytes[start - 1].is_ascii_digit();
            let clear_after = bytes.get(start + shape.len()).is_none_or(|next| !next.is_ascii_digit());
            fits && clear_before && clear_after
        })
    });
    let tokens: Vec<&str> =
        words.split(|ch: char| !ch.is_ascii_alphanumeric()).filter(|token| !token.is_empty()).collect();
    let is_day = |token: &str| token.len() <= 2 && token.chars().all(|ch| ch.is_ascii_digit());
    let is_month = |token: &str| {
        let named = token.to_ascii_lowercase();
        MONTHS.iter().any(|full| named == *full || named == full[..3])
    };
    let named = tokens.windows(3).any(|three| {
        let year = three[2].len() == 4 && three[2].starts_with("20") && three[2].chars().all(|ch| ch.is_ascii_digit());
        year && ((is_day(three[0]) && is_month(three[1])) || (is_month(three[0]) && is_day(three[1])))
    });
    numbered || named
}

/// A number after `#`, or after "PR" as a word: a pull request's or an issue's.
fn has_issue_number(words: &str) -> bool {
    let bytes = words.as_bytes();
    let marked = bytes.iter().enumerate().any(|(at, &byte)| {
        let clear_before = at == 0 || !bytes[at - 1].is_ascii_digit();
        let digits = bytes[at + 1..].iter().take_while(|next| next.is_ascii_digit()).count();
        byte == b'#' && clear_before && digits >= 2
    });
    let tokens: Vec<&str> =
        words.split(|ch: char| !ch.is_ascii_alphanumeric()).filter(|token| !token.is_empty()).collect();
    let named = tokens.windows(2).any(|two| {
        let number = two[1].len() >= 2 && two[1].chars().all(|ch| ch.is_ascii_digit());
        number && two[0] == "PR"
    });
    marked || named
}

/// Standards named the way a ticket is, by capital letters, a hyphen and a number.
const STANDARDS: [&str; 4] = ["UTF", "SHA", "ISO", "RFC"];

/// Capital words joined by a hyphen, the first possibly numbered, or a capital word and a number joined by one, save
/// a standard's name.
fn has_ticket_tag(words: &str) -> bool {
    words.split(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '-')).any(|token| {
        let mut parts = token.split('-');
        let (Some(first), Some(second)) = (parts.next(), parts.next()) else { return false };
        let letters = first.chars().take_while(char::is_ascii_uppercase).count();
        let first_ok = letters >= 2 && first.chars().skip(letters).all(|ch| ch.is_ascii_digit());
        let words_joined = second.len() >= 2
            && second.chars().take(2).all(|ch| ch.is_ascii_uppercase())
            && second.chars().all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit());
        let numbered =
            !second.is_empty() && second.chars().all(|ch| ch.is_ascii_digit()) && !STANDARDS.contains(&first);
        first_ok && (words_joined || numbered)
    })
}

pub fn check(sources: &[(String, String)]) -> Vec<Problem> {
    let mut problems = Vec::new();
    for (path, text) in sources {
        let comments = if path.ends_with(".py") {
            python_comments(text)
        } else if is_script(path) {
            script_comments(text)
        } else {
            rust_comments(text)
        };
        for comment in comments {
            let mut in_example = false;
            let mut counted = 0;
            let mut example_lines = 0;
            for (line, body) in &comment.lines {
                let words = words_of(body);
                if let Some(marker) = history_marker(words) {
                    let message = format!("this comment holds {marker}: history lives in git and the pull request");
                    problems.push(Problem::new("comments", path, Some(*line), message));
                }
                if words.starts_with("```") {
                    in_example = !in_example;
                    example_lines = 0;
                } else if in_example && !words.is_empty() {
                    example_lines += 1;
                } else if !words.is_empty() {
                    counted += 1;
                }
            }
            // A fence never closed is no example: its lines count like any other.
            if in_example {
                counted += example_lines;
            }
            if counted > MAX_COMMENT_LINES {
                let first = comment.lines.first().map(|(line, _)| *line);
                let message = format!(
                    "a {counted}-line comment: say why in {MAX_COMMENT_LINES} or fewer; how it works goes in the bible"
                );
                problems.push(Problem::new("comments", path, first, message));
            }
        }
    }
    problems
}

#[cfg(test)]
#[path = "comments_tests.rs"]
mod tests;
