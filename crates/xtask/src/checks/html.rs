//! No HTML in the game's interface, now or later ("The Interface Uses No HTML, Now or Later"): a page holds one canvas
//! and its script, no stylesheet stands beside the client's code, and no script builds, styles or writes into the
//! page's elements. Only the page's bridge (its input, pictures, announcements, services and entry) touches the page,
//! and it builds nothing.

use super::Problem;

/// The files that bridge the drawn interface and the page: they touch the page and build nothing on it.
const BRIDGE: [&str; 5] = [
    "client/src/main.ts",
    "client/src/ui/canvasEvents.ts",
    "client/src/ui/pictures.ts",
    "client/src/ui/announce.ts",
    "client/src/ui/page.ts",
];

/// What builds, styles or writes into a page's elements, and what each is called in a problem.
const REFUSED: [(&str, &str); 10] = [
    ("createElement(", "makes an element"),
    ("createElementNS(", "makes an element"),
    ("innerHTML", "writes HTML"),
    ("outerHTML", "writes HTML"),
    ("insertAdjacentHTML", "writes HTML"),
    ("document.write", "writes HTML"),
    (".classList", "styles an element"),
    (".className", "styles an element"),
    (".style.", "styles an element"),
    (".textContent", "writes words into the page"),
];

fn in_client(path: &str) -> bool {
    path.starts_with("client/")
}

/// A test, or a fake page for tests, may stand in for the page; the game never runs it.
fn for_tests(path: &str) -> bool {
    path.ends_with(".test.ts") || path.ends_with("ForTests.ts")
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

/// Every script in the client but the bridge and the tests, read for what builds HTML.
pub fn check_scripts(sources: &[(String, String)]) -> Vec<Problem> {
    let mut problems = Vec::new();
    for (path, text) in sources {
        if !in_client(path) || for_tests(path) || BRIDGE.contains(&path.as_str()) {
            continue;
        }
        for (index, line) in text.lines().enumerate() {
            let said = |what: &str| {
                Problem::new(
                    "html",
                    path,
                    Some(index + 1),
                    format!("{what}: draw it in the game's interface (client/src/ui)"),
                )
            };
            if let Some((_, what)) = REFUSED.iter().find(|(word, _)| line.contains(word)) {
                problems.push(said(what));
            } else if let Some(name) = element_type(line) {
                problems.push(said(&format!("names {name}, a page's element")));
            } else if line.trim_start().starts_with("import '") && line.contains(".css'") {
                problems.push(said("wears a stylesheet"));
            }
        }
    }
    problems
}

/// What a page's body may hold: its canvas and its script, and nothing else.
fn body_of(html: &str) -> Option<&str> {
    let open = html.find("<body")?;
    let start = open + html[open..].find('>')? + 1;
    let end = html.find("</body>")?;
    (start <= end).then(|| &html[start..end])
}

/// Removes every `<tag ...>...</tag>` from `text`.
fn without(text: &str, tag: &str) -> String {
    let (open, close) = (format!("<{tag}"), format!("</{tag}>"));
    let mut left = text.to_owned();
    while let Some(at) = left.find(&open) {
        let Some(end) = left[at..].find(&close) else { break };
        left.replace_range(at..at + end + close.len(), "");
    }
    left
}

/// Every page and stylesheet in the client: a page's body is its canvas and its script, it links no stylesheet, and
/// no stylesheet stands in the client.
pub fn check_pages(pages: &[(String, String)], files: &[String]) -> Vec<Problem> {
    let mut problems: Vec<Problem> = files
        .iter()
        .filter(|path| in_client(path) && path.ends_with(".css"))
        .map(|path| Problem::new("html", path, None, "a stylesheet: the game draws its interface, so nothing wears it"))
        .collect();
    for (path, html) in pages.iter().filter(|(path, _)| in_client(path) && path.ends_with(".html")) {
        let Some(body) = body_of(html) else {
            problems.push(Problem::new("html", path, None, "no <body> to hold the canvas and its script"));
            continue;
        };
        if !without(&without(body, "canvas"), "script").trim().is_empty() {
            problems.push(Problem::new("html", path, None, "its body holds more than one canvas and its script"));
        }
        if html.contains("rel=\"stylesheet\"") {
            problems.push(Problem::new("html", path, None, "links a stylesheet: the game draws its interface"));
        }
    }
    problems
}

#[cfg(test)]
mod tests {
    use super::*;

    fn script(path: &str, text: &str) -> Vec<Problem> {
        check_scripts(&[(path.to_owned(), text.to_owned())])
    }

    #[test]
    fn a_script_that_builds_or_styles_an_element_is_refused() {
        for line in [
            "const div = document.createElement('div');",
            "node.innerHTML = '<b>hi</b>';",
            "root.classList.add('open');",
            "panel.style.left = '4px';",
            "label.textContent = 'Name';",
            "function at(root: HTMLElement) {}",
            "import './menu.css';",
        ] {
            let problems = script("client/src/game/menu.ts", line);
            assert_eq!(problems.len(), 1, "{line}");
            assert_eq!(problems[0].line, Some(1));
        }
    }

    #[test]
    fn the_canvas_the_bridge_and_the_tests_may_touch_the_page() {
        assert!(script("client/src/game/game.ts", "export function start(canvas: HTMLCanvasElement) {}").is_empty());
        assert!(script("client/src/ui/page.ts", "surface.style.touchAction = 'none';").is_empty());
        assert!(script("client/src/game/menu.test.ts", "root.textContent = 'x';").is_empty());
        assert!(script("client/src/game/pageForTests.ts", "class FakeElement { className = ''; }").is_empty());
        assert!(script("tools/shot.mjs", "document.createElement('canvas')").is_empty());
        assert!(script("client/src/game/drain.ts", "// a drawn HUD, an HTML page no more").is_empty());
    }

    #[test]
    fn a_page_is_a_canvas_and_its_script() {
        let page =
            |body: &str| format!("<!doctype html><html><head><title>Overlook</title></head><body>{body}</body></html>");
        let checked = |html: String| check_pages(&[("client/index.html".to_owned(), html)], &[]);
        assert!(
            checked(page(
                "\n  <canvas id=\"game\"></canvas>\n  <script type=\"module\" src=\"/src/main.ts\"></script>\n"
            ))
            .is_empty()
        );
        assert_eq!(checked(page("<canvas></canvas><div id=\"hud\"></div><script></script>")).len(), 1);
        let linked = "<html><head><link rel=\"stylesheet\" href=\"/src/face.css\" /></head><body><canvas></canvas></body></html>";
        assert_eq!(checked(linked.to_owned()).len(), 1);
    }

    #[test]
    fn a_stylesheet_in_the_client_is_refused() {
        let files = ["client/src/face.css".to_owned(), "tools/report.css".to_owned()];
        let problems = check_pages(&[], &files);
        assert_eq!(problems.len(), 1);
        assert_eq!(problems[0].file, "client/src/face.css");
    }
}
