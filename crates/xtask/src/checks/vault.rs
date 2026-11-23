use super::Problem;

/// Where the Obsidian vault lives in the repository.
pub const VAULT_ROOT: &str = "bible/";

/// A link inside a note: what it names, and its 1-based line.
#[derive(Debug, PartialEq, Eq)]
pub struct Link {
    pub target: String,
    pub line: usize,
}

/// The wikilinks of a note, outside code blocks and inline code. `[[Note]]`, `[[Note|shown]]`, `[[Note#Heading]]`
/// and embeds `![[Picture.png]]` all name their target before any `|`, `#` or `^`.
pub fn wikilinks_of(text: &str) -> Vec<Link> {
    let mut links = Vec::new();
    let mut in_fence = false;
    for (offset, raw) in text.lines().enumerate() {
        let trimmed = raw.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        let without_code: String = raw.split('`').step_by(2).collect::<Vec<_>>().join(" ");
        let mut rest = without_code.as_str();
        while let Some(open) = rest.find("[[") {
            let after = &rest[open + 2..];
            let Some(close) = after.find("]]") else { break };
            let inner = &after[..close];
            let target = inner.split(['|', '#', '^']).next().unwrap_or_default().trim();
            if !target.is_empty() {
                links.push(Link { target: target.to_owned(), line: offset + 1 });
            }
            rest = &after[close + 2..];
        }
    }
    links
}

/// The `code:` property in a note's front matter: repo paths, each optionally `path#symbol`.
pub fn code_refs_of(text: &str) -> Vec<Link> {
    let mut refs = Vec::new();
    let mut lines = text.lines().enumerate();
    if lines.next().map(|(_, first)| first.trim_end()) != Some("---") {
        return refs;
    }
    let mut in_code = false;
    for (offset, raw) in lines {
        if raw.trim_end() == "---" {
            break;
        }
        let unquote = |value: &str| value.trim().trim_matches(['"', '\'']).to_owned();
        if let Some((key, value)) = raw.split_once(':').filter(|(key, _)| !key.starts_with(' ') && !key.is_empty()) {
            in_code = key.trim() == "code";
            let value = value.trim();
            if in_code && !value.is_empty() && value != "[]" {
                refs.push(Link { target: unquote(value), line: offset + 1 });
            }
        } else if let Some(item) = raw.trim_start().strip_prefix("- ").filter(|_| in_code) {
            refs.push(Link { target: unquote(item), line: offset + 1 });
        }
    }
    refs
}

fn is_name_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_' || ch == '$'
}

fn contains_word(text: &str, word: &str) -> bool {
    text.match_indices(word).any(|(start, _)| {
        let before = text[..start].chars().next_back().is_none_or(|ch| !is_name_char(ch));
        let after = text[start + word.len()..].chars().next().is_none_or(|ch| !is_name_char(ch));
        before && after
    })
}

/// The languages whose files a `code:` symbol must be defined in, not only named.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Language {
    Rust,
    Script,
    Python,
}

fn language_of(path: &str) -> Option<Language> {
    match path.rsplit_once('.').map(|(_, extension)| extension) {
        Some("rs") => Some(Language::Rust),
        Some("ts" | "mts" | "tsx" | "js" | "mjs" | "cjs") => Some(Language::Script),
        Some("py") => Some(Language::Python),
        _ => None,
    }
}

/// A source with its comments blanked, each line kept where it was.
fn without_comments(source: &str, language: Language) -> String {
    let mut kept = String::with_capacity(source.len());
    let mut rest = source;
    while let Some(ch) = rest.chars().next() {
        let block = language != Language::Python && rest.starts_with("/*");
        let line = if language == Language::Python { rest.starts_with('#') } else { rest.starts_with("//") };
        if block {
            let end = rest[2..].find("*/").map_or(rest.len(), |at| at + 4);
            kept.extend(rest[..end].chars().filter(|ch| *ch == '\n'));
            rest = &rest[end..];
        } else if line {
            rest = &rest[rest.find('\n').unwrap_or(rest.len())..];
        } else {
            kept.push(ch);
            rest = &rest[ch.len_utf8()..];
        }
    }
    kept
}

/// The lines of a source with comments, imports, `use` statements and re-exports blanked: naming a symbol there does
/// not define it.
fn defining_lines(source: &str, language: Language) -> Vec<String> {
    let mut lines = Vec::new();
    let mut continued = false;
    for line in without_comments(source, language).lines() {
        let start = line.trim_start();
        let opens = |word: &str| start.strip_prefix(word).is_some_and(|after| after.starts_with([' ', '{', '\'', '"']));
        let begins = !continued
            && match language {
                Language::Rust => strip_visibility(start).starts_with("use "),
                Language::Script => {
                    let exported = start.strip_prefix("export").map(str::trim_start);
                    opens("import")
                        || exported.is_some_and(|after| after.starts_with(['{', '*']) || after.starts_with("type {"))
                }
                Language::Python => opens("import") || opens("from") && start.contains(" import "),
            };
        if !continued && !begins {
            lines.push(line.to_owned());
            continue;
        }
        lines.push(String::new());
        continued = match language {
            Language::Rust => !line.contains(';'),
            Language::Script => {
                let side_effect = begins && (start.starts_with("import '") || start.starts_with("import \""));
                !(side_effect || line.contains(';') || line.contains("from '") || line.contains("from \""))
            }
            Language::Python if begins => line.contains('(') && !line.contains(')'),
            Language::Python => !line.contains(')'),
        };
    }
    lines
}

/// A Rust item's line without its visibility: `pub `, `pub(crate) ` and the like.
fn strip_visibility(line: &str) -> &str {
    let Some(after) = line.strip_prefix("pub") else { return line };
    let after = match after.strip_prefix('(') {
        Some(inside) => inside.split_once(')').map_or(after, |(_, rest)| rest),
        None => after,
    };
    if after.starts_with(char::is_whitespace) { after.trim_start() } else { line }
}

/// A script's line without the words that may come before a member's or a declaration's name.
fn strip_modifiers(line: &str) -> &str {
    const MODIFIERS: [&str; 12] = [
        "export",
        "public",
        "private",
        "protected",
        "static",
        "readonly",
        "async",
        "get",
        "set",
        "override",
        "abstract",
        "declare",
    ];
    let mut rest = line;
    while let Some(after) =
        MODIFIERS.iter().find_map(|word| rest.strip_prefix(word).filter(|after| after.starts_with(char::is_whitespace)))
    {
        rest = after.trim_start();
    }
    rest.strip_prefix('*').unwrap_or(rest)
}

/// The keywords that define the name after them.
fn keywords(language: Language) -> &'static [&'static str] {
    match language {
        Language::Rust => &["fn", "struct", "enum", "trait", "type", "const", "static", "mod", "union", "macro_rules!"],
        Language::Script => {
            &["function", "function*", "class", "interface", "type", "const", "let", "var", "enum", "namespace"]
        }
        Language::Python => &["def", "class"],
    }
}

/// Whether `line` names `symbol` after a keyword that defines it: `fn gust`, `const GUST`, `class Gust`.
fn after_keyword(line: &str, symbol: &str, language: Language) -> bool {
    line.match_indices(symbol).any(|(at, _)| {
        let whole = !line[at + symbol.len()..].starts_with(is_name_char);
        let before = &line[..at];
        let spaced = before.ends_with(char::is_whitespace) || before.ends_with('!');
        let word = before.trim_end();
        whole
            && spaced
            && keywords(language)
                .iter()
                .any(|keyword| word.strip_suffix(keyword).is_some_and(|ahead| !ahead.ends_with(is_name_char)))
    })
}

/// Whether `line` starts by defining `symbol` as a member: a field, a variant, a property or a method, or a Python
/// name given a value.
fn starts_defining(line: &str, symbol: &str, language: Language) -> bool {
    let start = line.trim_start();
    let start = match language {
        Language::Rust => strip_visibility(start),
        Language::Script => strip_modifiers(start),
        Language::Python => start,
    };
    let Some(after) = start.strip_prefix(symbol).filter(|after| !after.starts_with(is_name_char)) else {
        return false;
    };
    let after = after.trim_start();
    let gives = |after: &str| after.strip_prefix('=').is_some_and(|value| !value.starts_with(['=', '>']));
    match language {
        Language::Rust => {
            after.is_empty()
                || after.starts_with([',', '{'])
                || after.starts_with(':') && !after.starts_with("::")
                || gives(after)
                || after.starts_with('(') && line.trim_end().ends_with("),")
        }
        Language::Script => {
            let member = after.strip_prefix(['?', '!']).unwrap_or(after).trim_start();
            member.is_empty() || member.starts_with([':', ',', ';']) || gives(member) || defines_method(after)
        }
        Language::Python => after.starts_with(':') || gives(after),
    }
}

/// Whether what follows a name opens a method's definition: its parameters, and a body or a type before it, or a
/// parameter list that goes on below.
fn defines_method(after: &str) -> bool {
    let after = match after.strip_prefix('<') {
        Some(_) => after.rfind(">(").map_or(after, |at| &after[at + 1..]),
        None => after,
    };
    let Some(parameters) = after.strip_prefix('(') else { return false };
    let line = parameters.trim_end();
    line.is_empty()
        || line.ends_with('{')
            && line.match_indices(')').any(|(at, _)| {
                let rest = line[at + 1..].trim_start();
                rest == "{" || rest.starts_with(':')
            })
}

/// Whether `source`, a file at `path`, holds `symbol`: defined there for Rust, scripts and Python, named anywhere
/// else.
fn holds_symbol(path: &str, source: &str, symbol: &str) -> bool {
    let Some(language) = language_of(path) else { return contains_word(source, symbol) };
    defining_lines(source, language)
        .iter()
        .any(|line| after_keyword(line, symbol, language) || starts_defining(line, symbol, language))
}

/// Every wikilink resolves, and every `code:` reference names a file that exists (and, with `#symbol`, defines it:
/// an import, a `use` or a comment that names it is not where it lives).
/// Obsidian resolves `[[Name]]` by file name anywhere in the vault, `[[folder/Name]]` by path, a picture by its
/// full file name.
pub fn check(notes: &[(String, String)], repo_files: &[String], read: impl Fn(&str) -> Option<String>) -> Vec<Problem> {
    let mut targets = std::collections::HashSet::new();
    for file in repo_files.iter().filter_map(|path| path.strip_prefix(VAULT_ROOT)) {
        let name = file.rsplit('/').next().unwrap_or(file);
        for form in [file, name] {
            targets.insert(form.to_owned());
            targets.insert(form.strip_suffix(".md").unwrap_or(form).to_owned());
        }
    }
    let mut problems = Vec::new();
    for (path, text) in notes {
        for link in wikilinks_of(text) {
            if !targets.contains(&link.target) {
                problems.push(Problem::new(
                    "vault",
                    path,
                    Some(link.line),
                    format!("[[{}]] links to no note", link.target),
                ));
            }
        }
        for reference in code_refs_of(text) {
            let (file, symbol) = reference.target.split_once('#').unwrap_or((&reference.target, ""));
            let message = match read(file) {
                None => Some(format!("code: {file} does not exist")),
                Some(source) if !symbol.is_empty() && !holds_symbol(file, &source, symbol) => {
                    Some(format!("code: {file} defines no \"{symbol}\""))
                }
                Some(_) => None,
            };
            if let Some(message) = message {
                problems.push(Problem::new("vault", path, Some(reference.line), message));
            }
        }
    }
    problems
}

#[cfg(test)]
#[path = "vault_tests.rs"]
mod tests;
