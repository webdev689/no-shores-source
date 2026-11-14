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

fn contains_word(text: &str, word: &str) -> bool {
    let is_name_char = |ch: char| ch.is_alphanumeric() || ch == '_';
    text.match_indices(word).any(|(start, _)| {
        let before = text[..start].chars().next_back().is_none_or(|ch| !is_name_char(ch));
        let after = text[start + word.len()..].chars().next().is_none_or(|ch| !is_name_char(ch));
        before && after
    })
}

/// Every wikilink resolves, and every `code:` reference names a file that exists (and, with `#symbol`, holds it).
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
                Some(source) if !symbol.is_empty() && !contains_word(&source, symbol) => {
                    Some(format!("code: {file} has no \"{symbol}\""))
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
