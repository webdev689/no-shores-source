//! No HTML in the game's interface, now or later: a page holds one canvas and the module that draws on it, no
//! stylesheet stands in the client or is imported by its code, and no script builds, styles or writes into the
//! page's elements. Only the page's bridge (`BRIDGE`) may use what the scripts are refused, each for the little it
//! must do on the page.

use super::layers::{imports_of, resolve};
use super::{Problem, SCRIPT_EXTENSIONS, is_script};
use std::collections::HashSet;

/// The files that may use what other scripts are refused: `canvasEvents.ts` sets the canvas's cursor; `pictures.ts`
/// decodes SVG through an image it never shows; `page.ts` holds the page's touches, borrows a link and a file input
/// for a moment to save or open a file, and writes the words that say the game could not start.
const BRIDGE: [&str; 3] = ["client/src/ui/canvasEvents.ts", "client/src/ui/page.ts", "client/src/ui/pictures.ts"];

/// What builds, styles or writes into a page's elements, and what each is called in a problem. A line is read
/// `normalized`, so `document['createElement'] ('div')` is read as `document.createElement('div')`, and a word that
/// ends in a letter is read whole, so `new Image` is refused but `new ImageData` is not.
const REFUSED: [(&str, &str); 42] = [
    ("createElement", "makes an element"),
    ("createElementNS", "makes an element"),
    ("createTextNode", "makes an element"),
    ("createContextualFragment", "makes an element"),
    ("new Image", "makes an element"),
    ("new Option", "makes an element"),
    ("new Audio", "makes an element"),
    ("new DocumentFragment", "makes an element"),
    ("cloneNode", "makes an element"),
    ("attachShadow", "makes an element"),
    ("customElements", "makes an element"),
    ("appendChild", "puts an element into the page"),
    ("insertBefore", "puts an element into the page"),
    ("insertAdjacentElement", "puts an element into the page"),
    ("insertAdjacentHTML", "writes HTML"),
    ("insertAdjacentText", "writes words into the page"),
    ("replaceChild", "puts an element into the page"),
    ("replaceChildren", "puts an element into the page"),
    ("replaceWith", "puts an element into the page"),
    ("innerHTML", "writes HTML"),
    ("outerHTML", "writes HTML"),
    ("setHTML", "writes HTML"),
    ("setHTMLUnsafe", "writes HTML"),
    ("DOMParser", "writes HTML"),
    ("document.write", "writes HTML"),
    ("document.writeln", "writes HTML"),
    (".textContent", "writes words into the page"),
    ("innerText", "writes words into the page"),
    ("outerText", "writes words into the page"),
    ("nodeValue", "writes words into the page"),
    ("setAttribute", "styles an element"),
    ("setAttributeNS", "styles an element"),
    (".classList", "styles an element"),
    (".className", "styles an element"),
    (".style.", "styles an element"),
    (".style[", "styles an element"),
    ("cssText", "styles an element"),
    ("setProperty", "styles an element"),
    ("adoptedStyleSheets", "wears a stylesheet"),
    ("styleSheets", "wears a stylesheet"),
    ("CSSStyleSheet", "wears a stylesheet"),
    ("insertRule", "wears a stylesheet"),
];

/// What a stylesheet's file name ends with, in any case: plain CSS and the languages written into it.
const STYLESHEETS: [&str; 5] = [".css", ".scss", ".sass", ".less", ".styl"];

/// The tags a page may hold: its head's, the canvas and the script.
const PAGE_TAGS: [&str; 10] =
    ["!doctype", "html", "head", "meta", "title", "link", "style", "body", "canvas", "script"];

fn in_client(path: &str) -> bool {
    path.starts_with("client/")
}

/// A page in the client, by its name's ending in any case.
pub fn is_page(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    in_client(path) && [".html", ".htm", ".xhtml"].iter().any(|ending| lower.ends_with(ending))
}

fn is_stylesheet(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    STYLESHEETS.iter().any(|ending| lower.ends_with(ending))
}

/// Whether `specifier` brings in a stylesheet. `?raw` reads one as text, as the font's sheet is read for its files.
fn wears_stylesheet(specifier: &str) -> bool {
    let (path, query) = specifier.split_once('?').unwrap_or((specifier, ""));
    is_stylesheet(path) && query != "raw"
}

fn stem(path: &str) -> &str {
    path.rsplit_once('.').map_or(path, |(stem, _)| stem)
}

/// A test, or an aid made for tests (`...ForTests.ts`).
fn test_side(path: &str) -> bool {
    stem(path).ends_with(".test") || stem(path).ends_with("ForTests")
}

/// The source `specifier` names from `from`, if it is one of `paths`, with or without its extension.
fn imported<'a>(from: &str, specifier: &str, paths: &HashSet<&'a str>) -> Option<&'a str> {
    let target = resolve(from, specifier.split(['?', '#']).next().unwrap_or(specifier));
    let found = paths.get(target.as_str());
    found
        .or_else(|| SCRIPT_EXTENSIONS.iter().find_map(|ending| paths.get(format!("{target}{ending}").as_str())))
        .copied()
}

/// The tests and the aids for them that the game never runs: those that nothing but tests and their aids reach.
fn for_tests(scripts: &[&(String, String)]) -> HashSet<String> {
    let paths: HashSet<&str> = scripts.iter().map(|(path, _)| path.as_str()).collect();
    let mut edges = Vec::new();
    for (path, text) in scripts {
        for (specifier, _) in imports_of(text).into_iter().filter(|(specifier, _)| specifier.starts_with('.')) {
            edges.extend(imported(path, &specifier, &paths).map(|target| (path.as_str(), target)));
        }
    }
    let mut run: HashSet<&str> = paths.iter().copied().filter(|path| !test_side(path)).collect();
    while let Some(reached) = edges.iter().find(|(from, to)| run.contains(from) && !run.contains(to)).map(|(_, to)| *to)
    {
        run.insert(reached);
    }
    paths.iter().filter(|path| !run.contains(*path)).map(|path| (*path).to_owned()).collect()
}

/// A line as the refused words are looked for in it: whitespace run together, none before a bracket or round a dot,
/// strings joined where `+` joins them, and a member named in a string (`['x']`) read as `.x`.
fn normalized(line: &str) -> String {
    let mut text = line.split_whitespace().collect::<Vec<_>>().join(" ");
    for (spaced, joined) in [(" (", "("), (" [", "["), ("[ ", "["), (" ]", "]"), (" .", "."), (". ", "."), (" + ", "+")]
    {
        text = text.replace(spaced, joined);
    }
    for quote in ['\'', '"', '`'] {
        text = text.replace(&format!("{quote}+{quote}"), "");
    }
    let mut read = String::with_capacity(text.len());
    let mut rest = text.as_str();
    while let Some(at) = rest.find('[') {
        read.push_str(&rest[..at]);
        let inner = &rest[at + 1..];
        let quote = inner.chars().next().filter(|ch| matches!(ch, '\'' | '"' | '`'));
        let name = quote.and_then(|quote| inner[1..].split_once(quote)).map(|(name, _)| name);
        match name.filter(|name| !name.is_empty() && name.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '_')) {
            Some(name) if inner[name.len() + 2..].starts_with(']') => {
                read.push('.');
                read.push_str(name);
                rest = &inner[name.len() + 3..];
            }
            _ => {
                read.push('[');
                rest = inner;
            }
        }
    }
    read.push_str(rest);
    read
}

/// An element type named in a script: `HTML...Element`, but for the canvas the game draws on.
fn element_type(line: &str) -> Option<&str> {
    let mut rest = line;
    while let Some(at) = rest.find("HTML") {
        let word: String =
            rest[at..].chars().take_while(|letter| letter.is_ascii_alphanumeric() || *letter == '_').collect();
        if word.len() > "HTMLElement".len() - 1 && word.ends_with("Element") && word != "HTMLCanvasElement" {
            return Some(&rest[at..at + word.len()]);
        }
        rest = &rest[at + word.len().max(4)..];
    }
    None
}

fn is_name(letter: char) -> bool {
    letter.is_ascii_alphanumeric() || letter == '_' || letter == '$'
}

/// Whether `line` holds `word`, read whole where it ends in a letter.
fn holds(line: &str, word: &str) -> bool {
    let whole = word.ends_with(is_name);
    line.match_indices(word).any(|(at, _)| !whole || !line[at + word.len()..].starts_with(is_name))
}

/// Whether `line` assigns to an element's style: `x.style = ...` or `Object.assign(x.style, ...)`.
fn assigns_style(line: &str) -> bool {
    let assigned = line.match_indices(".style").any(|(at, word)| {
        let after = line[at + word.len()..].trim_start();
        after.starts_with('=') && !after.starts_with("==")
    });
    let merged = line.match_indices("Object.assign(").any(|(at, call)| {
        line[at + call.len()..].split(',').next().is_some_and(|target| target.trim().ends_with(".style"))
    });
    assigned || merged
}

/// Whether `line` calls `.append(` or `.prepend(` on what may be an element: anything but a name `text` makes with
/// `new` (a list of the game's own, a `URLSearchParams`, a `FormData`), a URL's `searchParams` or a request's
/// `headers`.
fn appends_to_page(line: &str, text: &str) -> bool {
    [".append(", ".prepend("].iter().any(|call| {
        line.match_indices(call).any(|(at, _)| {
            let before = &line[..at];
            let receiver = &before[before.trim_end_matches(is_name).len()..];
            let made = !receiver.is_empty() && receiver != "this" && text.contains(&format!("{receiver} = new "));
            !made && !["searchParams", "headers"].contains(&receiver)
        })
    })
}

/// Every script in the client but the bridge and the tests the game never runs, read for what builds HTML.
pub fn check_scripts(sources: &[(String, String)]) -> Vec<Problem> {
    let scripts: Vec<&(String, String)> =
        sources.iter().filter(|(path, _)| in_client(path) && is_script(path)).collect();
    let tests = for_tests(&scripts);
    let mut problems = Vec::new();
    for (path, text) in scripts {
        if tests.contains(path) || BRIDGE.contains(&path.as_str()) {
            continue;
        }
        let said = |line: usize, what: &str| {
            Problem::new("html", path, Some(line), format!("{what}: draw it in the game's interface (client/src/ui)"))
        };
        for (index, raw) in text.lines().enumerate() {
            let line = normalized(raw);
            if let Some((_, what)) = REFUSED.iter().find(|(word, _)| holds(&line, word)) {
                problems.push(said(index + 1, what));
            } else if assigns_style(&line) {
                problems.push(said(index + 1, "styles an element"));
            } else if appends_to_page(&line, text) {
                problems.push(said(index + 1, "puts an element into the page"));
            } else if let Some(name) = element_type(&line) {
                problems.push(said(index + 1, &format!("names {name}, a page's element")));
            }
        }
        for (specifier, line) in imports_of(text) {
            if wears_stylesheet(&specifier) {
                problems.push(said(line, "wears a stylesheet"));
            }
        }
    }
    problems
}

/// A tag's attributes, each name lowercased, with its value unquoted (empty where it has none).
fn attributes(tag: &str) -> Vec<(String, String)> {
    let mut found = Vec::new();
    let mut rest = tag.trim_start_matches(|ch: char| !ch.is_whitespace() && ch != '/');
    loop {
        rest = rest.trim_start_matches(|ch: char| ch.is_whitespace() || ch == '/');
        let end = rest.find(|ch: char| ch.is_whitespace() || ch == '=' || ch == '/').unwrap_or(rest.len());
        if end == 0 {
            return found;
        }
        let name = rest[..end].to_ascii_lowercase();
        rest = rest[end..].trim_start();
        let mut value = String::new();
        if let Some(after) = rest.strip_prefix('=').map(str::trim_start) {
            let (taken, left) = match after.chars().next().filter(|ch| matches!(ch, '"' | '\'')) {
                Some(quote) => after[1..].split_once(quote).unwrap_or((&after[1..], "")),
                None => after.split_at(after.find(char::is_whitespace).unwrap_or(after.len())),
            };
            value = taken.to_owned();
            rest = left;
        }
        found.push((name, value));
    }
}

/// The selectors a page's style sets beyond the page itself (`html`, `body`, `:root`) and its canvas (`#id`); a
/// rule that is no plain selector, an `@import` or `@media`, is one too.
fn styled_beyond(css: &str, canvas: &str) -> Vec<String> {
    let mut text = css.to_owned();
    while let Some(start) = text.find("/*") {
        let end = text[start..].find("*/").map_or(text.len(), |at| start + at + 2);
        text.replace_range(start..end, "");
    }
    let own = format!("#{canvas}");
    text.split('}')
        .flat_map(|rule| rule.split_once('{').map_or(rule, |(selectors, _)| selectors).split(','))
        .map(str::trim)
        .filter(|selector| {
            !selector.is_empty()
                && !["html", "body", ":root"].contains(&selector.to_ascii_lowercase().as_str())
                && (canvas.is_empty() || *selector != own)
        })
        .map(str::to_owned)
        .collect()
}

/// What is wrong with a page: it holds one canvas and the module that draws on it, words only in its title, and a
/// style only for itself and its canvas.
fn page_problems(html: &str) -> Vec<String> {
    let mut problems = Vec::new();
    let mut canvases: Vec<String> = Vec::new();
    let mut scripts = 0;
    let mut css = String::new();
    let mut inside = String::new();
    let mut rest = html;
    while !rest.is_empty() {
        let open = rest.find('<').unwrap_or(rest.len());
        let words = rest[..open].trim();
        match inside.as_str() {
            "title" => {}
            "style" => css.push_str(&rest[..open]),
            "script" if !words.is_empty() => {
                problems.push("a script written in the page: load a module from its file".to_owned())
            }
            _ if !words.is_empty() => problems.push(format!("words written in the page (\"{words}\"): draw them")),
            _ => {}
        }
        rest = &rest[open..];
        if let Some(comment) = rest.strip_prefix("<!--") {
            rest = comment.split_once("-->").map_or("", |(_, after)| after);
            continue;
        }
        let Some((tag, after)) = rest.get(1..).and_then(|tag| tag.split_once('>')) else { break };
        rest = after;
        let name = tag.split(|ch: char| ch.is_whitespace() || ch == '/').find(|part| !part.is_empty()).unwrap_or("");
        let name = name.to_ascii_lowercase();
        if tag.starts_with('/') {
            inside.clear();
            continue;
        }
        if !PAGE_TAGS.contains(&name.as_str()) {
            problems.push(format!("holds a <{name}>: a page is one canvas and its script"));
        }
        let attributes = attributes(tag);
        let value = |wanted: &str| attributes.iter().find(|(name, _)| name == wanted).map(|(_, value)| value.as_str());
        for (attribute, said) in &attributes {
            let said = said.to_ascii_lowercase();
            if attribute.starts_with("on") {
                problems.push(format!("<{name} {attribute}=...>: a script written in the page"));
            } else if attribute == "style" {
                problems.push(format!("<{name} style=...>: styles an element"));
            } else if said.contains("stylesheet") || (attribute == "as" && said == "style") {
                problems.push(format!("<{name} {attribute}={said}>: links a stylesheet"));
            } else if attribute == "href" && wears_stylesheet(&said) {
                problems.push(format!("<{name} href={said}>: links a stylesheet"));
            }
        }
        scripts += usize::from(name == "script");
        match name.as_str() {
            "canvas" => canvases.push(value("id").unwrap_or_default().to_owned()),
            "script"
                if value("type").map(str::to_ascii_lowercase).as_deref() != Some("module")
                    || value("src").is_none() =>
            {
                problems
                    .push("a script that is not a module from its file: <script type=\"module\" src=...>".to_owned());
            }
            _ => {}
        }
        if matches!(name.as_str(), "title" | "style" | "script") {
            inside = name;
        }
    }
    if canvases.len() != 1 {
        problems.push(format!("holds {} canvases: the game draws on one", canvases.len()));
    }
    if scripts != 1 {
        problems.push(format!("holds {scripts} scripts: the page starts from one module"));
    }
    let canvas = canvases.first().map_or("", String::as_str);
    for selector in styled_beyond(&css, canvas) {
        problems.push(format!("its style sets {selector}: only the page and its canvas may be styled"));
    }
    problems
}

/// Every page and stylesheet in the client: a page is its canvas and its script, and no stylesheet stands in the
/// client.
pub fn check_pages(pages: &[(String, String)], files: &[String]) -> Vec<Problem> {
    let mut problems: Vec<Problem> = files
        .iter()
        .filter(|path| in_client(path) && is_stylesheet(path))
        .map(|path| Problem::new("html", path, None, "a stylesheet: the game draws its interface, so nothing wears it"))
        .collect();
    for (path, html) in pages.iter().filter(|(path, _)| is_page(path)) {
        problems.extend(page_problems(html).into_iter().map(|message| Problem::new("html", path, None, message)));
    }
    problems
}

#[cfg(test)]
#[path = "html_tests.rs"]
mod tests;
