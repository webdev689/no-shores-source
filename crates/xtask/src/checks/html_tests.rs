use super::*;

fn script(path: &str, text: &str) -> Vec<Problem> {
    check_scripts(&[(path.to_owned(), text.to_owned())])
}

fn scripts(sources: &[(&str, &str)]) -> Vec<Problem> {
    let owned: Vec<(String, String)> =
        sources.iter().map(|(path, text)| ((*path).to_owned(), (*text).to_owned())).collect();
    check_scripts(&owned)
}

#[test]
fn a_script_that_builds_an_element_in_any_spelling_is_refused() {
    for line in [
        "const div = document.createElement('div');",
        "const div = document['createElement']('div');",
        "const div = document[\"createElement\"](\"div\");",
        "const div = document [ `createElement` ] ('div');",
        "const div = document.createElement ('div');",
        "Reflect.apply(Document.prototype.createElement, document, ['div']);",
        "const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');",
        "const words = document.createTextNode('x');",
        "const bold = document.createRange().createContextualFragment('<b>x</b>');",
        "const picture = new Image();",
        "const picture = new Image;",
        "const choice = new Option('a', 'b');",
        "const sound = new  Audio ('x.mp3');",
        "const held = new DocumentFragment();",
        "const words = new Text('x');",
        "const copy = document.importNode(template.content, true);",
        "const copy = template.cloneNode(true);",
        "document.body.attachShadow({ mode: 'open' });",
        "customElements.define('x-menu', class {});",
        "function at(root: HTMLElement) {}",
    ] {
        let problems = script("client/src/game/menu.ts", line);
        assert_eq!(problems.len(), 1, "{line}");
        assert_eq!(problems[0].line, Some(1));
    }
}

#[test]
fn a_script_that_puts_an_element_or_words_into_the_page_is_refused() {
    for line in [
        "document.body.insertAdjacentElement('beforeend', node);",
        "document.createRange().insertNode(node);",
        "document.body.insertAdjacentHTML('beforeend', '<b>x</b>');",
        "document.body.insertAdjacentText('beforeend', 'x');",
        "document.body.appendChild(node);",
        "document.body.replaceChildren(node);",
        "document.body.replaceChild(node, old);",
        "document.body.insertBefore(node, null);",
        "old.replaceWith(node);",
        "document.body.append(node);",
        "document.body?.prepend(node);",
        "node.innerHTML = '<b>hi</b>';",
        "node['outer' + 'HTML'] = '<b>x</b>';",
        "document.body.setHTML('<b>x</b>');",
        "document.body.setHTMLUnsafe('<b>x</b>');",
        "const doc = new DOMParser().parseFromString('<div>x</div>', 'text/html');",
        "document.write('<b>x</b>');",
        "label.textContent = 'Name';",
        "node.innerText = 'x';",
        "node.outerText = 'x';",
        "node.firstChild.nodeValue = 'x';",
    ] {
        assert_eq!(script("client/src/game/menu.ts", line).len(), 1, "{line}");
    }
}

#[test]
fn a_script_that_styles_an_element_or_wears_a_sheet_is_refused() {
    for line in [
        "node.setAttribute('style', 'left:4px');",
        "node.setAttribute('class', 'open');",
        "root.classList.add('open');",
        "root.className = 'open';",
        "panel.style.left = '4px';",
        "node.style['left'] = '4px';",
        "node.style[side] = '4px';",
        "node.style = 'left:4px';",
        "Object.assign(node.style, { left: '4px' });",
        "const shape = node.style; shape.cssText = 'left:4px';",
        "shape.setProperty('left', '4px');",
        "document.adoptedStyleSheets = [sheet];",
        "const sheet = new CSSStyleSheet();",
        "document.styleSheets[0].insertRule('div{}');",
        "sheet.insertRule('div{}');",
        "import './menu.css';",
        "import \"./menu.css\";",
        "import   './menu.css';",
        "import './menu.css?inline';",
        "import sheet from './menu.css?url';",
        "import './menu.CSS';",
        "import './menu.scss';",
        "const sheet = await import('./menu.css');",
        "import './menu.css' with { type: 'css' };",
    ] {
        assert_eq!(script("client/src/game/menu.ts", line).len(), 1, "{line}");
    }
}

#[test]
fn what_only_looks_like_the_page_passes() {
    for text in [
        "const params = new URLSearchParams(location.search);\nparams.append('room', name);",
        "const form = new FormData();\nform.append('file', blob);",
        "url.searchParams.append('room', name);",
        "private readonly ground = new Laid();\nfunction lay() { ground.append(standing); }",
        "const pixels = new ImageData(1, 1);\nconst bitmap = new ImageBitmap();\nconst audio = new AudioContext();",
        "if (hair.style === 'braid' && HAIR_STYLES.includes(hair.style)) return door.style;",
        "paintBox(pen, box, look.css);",
        "import sheet from '@fontsource-variable/pixelify-sans/index.css?raw';",
        "export function start(canvas: HTMLCanvasElement) {}",
        "// a drawn HUD, an HTML page no more",
        "Object.assign(canvas, size);",
    ] {
        assert!(script("client/src/game/menu.ts", text).is_empty(), "{text}");
    }
    assert!(script("tools/shot.mjs", "document.createElement('canvas')").is_empty());
}

#[test]
fn a_name_given_an_element_anywhere_is_not_excused_by_a_new_one() {
    for text in [
        "let held = new Laid();\nheld = document.body;\nheld.append(words);",
        "const mylist = new Laid();\nfunction lay(list) { list.append(words); }",
    ] {
        let problems = script("client/src/game/menu.ts", text);
        assert_eq!(problems.len(), 1, "{text}");
        assert!(problems[0].message.starts_with("puts an element into the page"), "{text}");
    }
    let decoded = "const words = new TextDecoder().decode(bytes);\nconst encoder = new TextEncoder();";
    assert!(script("client/src/game/menu.ts", decoded).is_empty());
}

#[test]
fn only_the_bridge_may_touch_the_page() {
    assert!(script("client/src/ui/page.ts", "const link = document.createElement('a');").is_empty());
    assert!(script("client/src/ui/canvasEvents.ts", "this.canvas.style.cursor = cursor;").is_empty());
    assert!(script("client/src/ui/pictures.ts", "const image = new Image();").is_empty());
    assert_eq!(script("client/src/main.ts", "document.body.textContent = message;").len(), 1);
    assert_eq!(script("client/src/ui/announce.ts", "document.body.append(words);").len(), 1);
}

#[test]
fn a_test_and_its_aids_are_free_only_while_nothing_but_tests_reach_them() {
    let aid = ("client/src/game/pageForTests.ts", "export const made = document.createElement('div');");
    let test = ("client/src/game/screens.test.ts", "import { made } from './pageForTests.ts';");
    assert!(scripts(&[aid, test]).is_empty());
    let game = ("client/src/game/screens.ts", "import { made } from './pageForTests.ts';");
    assert_eq!(scripts(&[aid, test, game]).len(), 1);
    let bare = ("client/src/game/screens.ts", "import { made } from './pageForTests';");
    assert_eq!(scripts(&[aid, test, bare]).len(), 1);
    let between = ("client/src/ui/uiForTests.ts", "export * from '../game/pageForTests.ts';");
    let through = ("client/src/game/screens.ts", "import '../ui/uiForTests.ts';");
    assert_eq!(scripts(&[aid, between, through]).len(), 1);
    let reached = ("client/src/game/menu.test.ts", "root.textContent = 'x';");
    assert!(scripts(&[reached]).is_empty());
    assert_eq!(scripts(&[reached, ("client/src/game/menu.ts", "import './menu.test.ts';")]).len(), 1);
}

const HEAD: &str = "<meta charset=\"utf-8\" /><title>No Shores</title>";
const STYLE: &str =
    "<style>:root { color-scheme: dark; } html, body { margin: 0; } /* fills */ #game { width: 100%; }</style>";
const CANVAS: &str = "<canvas id=\"game\" role=\"application\" aria-label=\"No Shores\"></canvas>";
const SCRIPT: &str = "<script type=\"module\" src=\"/src/main.ts\"></script>";

fn page(head: &str, body: &str) -> String {
    format!("<!doctype html>\n<html lang=\"en\">\n<head>{HEAD}{head}</head>\n<body>\n  {body}\n</body>\n</html>")
}

fn page_refused(html: &str) -> bool {
    !check_pages(&[("client/x/index.html".to_owned(), html.to_owned())], &[]).is_empty()
}

#[test]
fn a_page_is_one_canvas_and_its_module() {
    let good = page(STYLE, &format!("{CANVAS}\n  {SCRIPT}"));
    assert!(check_pages(&[("client/index.html".to_owned(), good)], &[]).is_empty());
    let body = format!("{CANVAS}{SCRIPT}");
    for (way, html) in [
        ("a second canvas", page("", &format!("{CANVAS}<canvas id=\"hud\"></canvas>{SCRIPT}"))),
        ("no canvas", page("", SCRIPT)),
        ("a div beside the canvas", page("", &format!("{body}<div id=\"hud\"></div>"))),
        ("a div inside the canvas", page("", &format!("<canvas id=\"game\"><div>menu</div></canvas>{SCRIPT}"))),
        ("words inside the canvas", page("", &format!("<canvas id=\"game\">Your browser</canvas>{SCRIPT}"))),
        ("a div in the head", page("<div id=hud>hi</div>", &body)),
        ("a div after the body", page("", &body).replace("</html>", "<div>hud</div></html>")),
        ("a noscript", page("", &format!("{body}<noscript><p>Enable JS</p></noscript>"))),
        ("a canvas left open", page("", &format!("<canvas id=\"game\">{SCRIPT}<div>x</div></canvas>"))),
        ("an inline handler", page("", &format!("<canvas id=\"game\" onclick=\"go()\"></canvas>{SCRIPT}"))),
        ("a handler on the body", page("", &body).replace("<body>", "<BODY ONLOAD=go()>")),
        ("a style attribute", page("", &body).replace("<body>", "<body style=\"color:red\">")),
        ("an inline script", page("", &format!("{CANVAS}<script>document.body.append('x')</script>"))),
        ("a module written in", page("", &format!("{CANVAS}<script type=\"module\">go()</script>"))),
        ("a classic script", page("", &format!("{CANVAS}<script src=\"/src/main.ts\"></script>"))),
        ("a second module", page("", &format!("{body}<script type=\"module\" src=\"/src/b.ts\"></script>"))),
        ("no script", page("", CANVAS)),
    ] {
        assert!(page_refused(&html), "{way}");
    }
}

#[test]
fn a_page_links_no_stylesheet_and_styles_only_itself_and_its_canvas() {
    let body = format!("{CANVAS}{SCRIPT}");
    for (way, head) in [
        ("double quotes", "<link rel=\"stylesheet\" href=\"/x.css\" />"),
        ("single quotes", "<link rel='stylesheet' href='/x.css'>"),
        ("no quotes", "<link rel=stylesheet href=/x.css>"),
        ("capitals", "<LINK REL=\"STYLESHEET\" HREF=\"/x\">"),
        ("an alternate", "<link rel=\"alternate stylesheet\" href=\"/x\">"),
        ("preloaded as a style", "<link rel=\"preload\" as=\"style\" href=\"/x\">"),
        ("a sheet's file", "<link rel=\"prefetch\" href=\"/x.css?v=2\">"),
        ("a style for an element", "<style>#hud { left: 0 }</style>"),
        ("a style for every div", "<style>html, div { margin: 0 }</style>"),
        ("a style that writes words", "<style>body::before { content: 'menu' }</style>"),
        ("an imported sheet", "<style>@import url(/x.css); html { margin: 0 }</style>"),
        ("a rule held in a media query", "<style>@media (width > 1px) { html { margin: 0 } }</style>"),
    ] {
        assert!(page_refused(&page(head, &body)), "{way}");
    }
    assert!(!page_refused(&page("<link rel=\"icon\" href=\"/icon.png\">", &body)));
}

#[test]
fn a_page_by_any_ending_is_a_page() {
    assert!(is_page("client/index.html") && is_page("client/menu.HTM") && is_page("client/x/menu.xhtml"));
    assert!(!is_page("tools/report.html") && !is_page("client/src/page.ts"));
}

#[test]
fn a_stylesheet_in_the_client_is_refused_in_any_language_or_case() {
    let files =
        ["client/src/face.css", "client/src/x.CSS", "client/src/x.scss", "client/public/x.less", "tools/report.css"]
            .map(String::from);
    let problems = check_pages(&[], &files);
    let refused: Vec<&str> = problems.iter().map(|problem| problem.file.as_str()).collect();
    assert_eq!(refused, ["client/src/face.css", "client/src/x.CSS", "client/src/x.scss", "client/public/x.less"]);
}

#[test]
fn a_line_is_read_in_its_plainest_spelling() {
    assert_eq!(normalized("document [ 'create' + 'Element' ] ('div')"), "document.createElement('div')");
    assert_eq!(normalized("node?.['style'].left"), "node?..style.left");
    assert_eq!(normalized("list[index]"), "list[index]");
}
