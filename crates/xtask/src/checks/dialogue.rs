use super::Problem;
use serde_json::{Map, Value};

/// Where the story's lines live: the cast (each speaker's name and voice) and every mission's scenes beside it.
pub const STORY_ROOT: &str = "content/story/";
const CAST: &str = "content/story/cast.json";

/// The Dialogue rule's numbers: words a line, words a bark, lines one speaker says in a row, lines a scene.
const LINE_WORDS: usize = 14;
const BARK_WORDS: usize = 4;
const TURN_LINES: usize = 2;
const SCENE_LINES: usize = 8;

/// What the speech system reads (client/src/speech/cast.ts), so the check refuses all it would refuse: a story it
/// cannot read would not start at all. The emotes it knows, a voice's numbers (all but the spread above zero), and
/// the shortest syllable that can swell and fall.
const EMOTES: [&str; 7] = ["alert", "question", "fear", "anger", "cheer", "pain", "silence"];
const VOICE_NUMBERS: [&str; 5] = ["pitchHz", "spreadHz", "muffleHz", "volume", "syllableS"];
const MAY_BE_ZERO: &str = "spreadHz";
const SHORTEST_SYLLABLE_S: f64 = 0.04;
/// The key a plain object cannot keep as its own: the speech system refuses a speaker, a voice or a scene so named.
const PROTOTYPE_KEY: &str = "__proto__";

/// A dash or a trailing-off the rule keeps out: a pause is a full stop.
const BANNED: [(&str, &str); 5] = [
    ("\u{2014}", "an em dash"),
    ("\u{2013}", "an en dash"),
    ("--", "a double hyphen"),
    ("\u{2026}", "an ellipsis"),
    ("...", "an ellipsis"),
];

fn problem(file: &str, message: String) -> Problem {
    Problem::new("dialogue", file, None, message)
}

/// A voice's numbers as the speech system needs them to be heard.
fn check_voice(key: &str, voice: &Value) -> Vec<String> {
    let Some(fields) = voice.as_object() else { return vec![format!("voice \"{key}\" is not an object")] };
    let mut found = Vec::new();
    for number in VOICE_NUMBERS {
        let given = fields.get(number).and_then(Value::as_f64);
        let usable = given.is_some_and(|value| value > 0.0 || (value == 0.0 && number == MAY_BE_ZERO));
        if !usable {
            found.push(format!("voice \"{key}\" has no usable {number}"));
        }
    }
    if fields.get("syllableS").and_then(Value::as_f64).is_some_and(|seconds| seconds < SHORTEST_SYLLABLE_S) {
        found.push(format!(
            "voice \"{key}\" has a syllableS under {SHORTEST_SYLLABLE_S} s, too short to swell and fall"
        ));
    }
    found
}

/// The cast as the speech system reads it: what it would refuse, and the speakers who can say a line.
fn check_cast(cast: &Value) -> (Vec<Problem>, Vec<String>) {
    let empty = Map::new();
    let mut found = Vec::new();
    let mut part = |name: &str| {
        let part = cast.get(name).and_then(Value::as_object);
        if part.is_none() {
            found.push(format!("the cast's {name} are not an object"));
        }
        part.unwrap_or(&empty)
    };
    let (voices, speakers) = (part("voices"), part("speakers"));
    for (name, part) in [("voices", voices), ("speakers", speakers)] {
        if part.contains_key(PROTOTYPE_KEY) {
            found.push(format!("the cast's {name} cannot hold the key \"{PROTOTYPE_KEY}\""));
        }
    }
    for (key, voice) in voices {
        found.extend(check_voice(key, voice));
    }
    let mut voiced = Vec::new();
    for (key, speaker) in speakers.iter().filter(|(key, _)| *key != PROTOTYPE_KEY) {
        if speaker.get("name").and_then(Value::as_str).is_none() {
            found.push(format!("speaker \"{key}\" has no name"));
        }
        match speaker.get("voice").and_then(Value::as_str) {
            Some(voice) if voice != PROTOTYPE_KEY && voices.contains_key(voice) => voiced.push(key.clone()),
            voice => found.push(format!(
                "speaker \"{key}\" has no voice: \"{}\" is not in the cast's voices",
                voice.unwrap_or_default()
            )),
        }
    }
    (found.into_iter().map(|message| problem(CAST, message)).collect(), voiced)
}

/// What JavaScript's `trim()` strips, which counts a line of only these as no words.
fn blank(mark: char) -> bool {
    mark.is_whitespace() || mark == '\u{feff}'
}

/// One line's problems: its speaker, its words and marks, its kind and its emote.
fn check_line(at: &str, line: &Value, speakers: &[String]) -> Vec<String> {
    if !line.is_object() {
        return vec![format!("{at} is not an object")];
    }
    let mut found = Vec::new();
    let who = line.get("who").and_then(Value::as_str).unwrap_or_default();
    if !speakers.iter().any(|speaker| speaker == who) {
        found.push(format!("{at}: \"{who}\" is not a speaker in the cast with a voice"));
    }
    let kind = line.get("kind");
    let bark = kind.and_then(Value::as_str) == Some("bark");
    if kind.is_some() && !bark {
        found.push(format!("{at}: kind {} is not \"bark\"", kind.map(Value::to_string).unwrap_or_default()));
    }
    if let Some(emote) = line.get("emote")
        && !emote.as_str().is_some_and(|name| EMOTES.contains(&name))
    {
        found.push(format!("{at}: emote {emote} is not one of {}", EMOTES.join(", ")));
    }
    let Some(said) = line.get("say").and_then(Value::as_str).filter(|said| !said.trim_matches(blank).is_empty()) else {
        found.push(format!("{at} says nothing: every line has its words in \"say\""));
        return found;
    };
    let (words, most) = (said.split_whitespace().count(), if bark { BARK_WORDS } else { LINE_WORDS });
    if words > most {
        let kind = if bark { "a bark" } else { "a line" };
        found.push(format!("{at} holds {words} words; {kind} holds {most}"));
    }
    for (mark, name) in BANNED {
        if said.contains(mark) {
            found.push(format!("{at} holds {name}: a pause is a full stop"));
        }
    }
    found
}

/// One scene held to the rule: a list of lines, each line sound, the turns short and the scene short.
fn check_scene(file: &str, scene: &str, lines: &Value, speakers: &[String]) -> Vec<Problem> {
    let Some(lines) = lines.as_array() else {
        return vec![problem(file, format!("scene \"{scene}\" is not a list of lines"))];
    };
    let mut found = Vec::new();
    if lines.len() > SCENE_LINES {
        found.push(format!("scene \"{scene}\" holds {} lines; a scene holds {SCENE_LINES}", lines.len()));
    }
    let (mut last, mut run) = ("", 0);
    for (index, line) in lines.iter().enumerate() {
        let at = format!("scene \"{scene}\", line {}", index + 1);
        found.extend(check_line(&at, line, speakers));
        let who = line.get("who").and_then(Value::as_str).unwrap_or_default();
        run = if who == last { run + 1 } else { 1 };
        if run == TURN_LINES + 1 {
            found.push(format!("{at}: \"{who}\" says more than {TURN_LINES} lines in a row"));
        }
        last = who;
    }
    found.into_iter().map(|message| problem(file, message)).collect()
}

/// Every scene in the story's files keeps to the Dialogue rule's numbers and marks, spoken by a voiced speaker, and
/// the cast and scenes are all the speech system can read.
pub fn check(files: &[(String, String)]) -> Vec<Problem> {
    let parsed: Vec<(&str, Result<Value, String>)> = files
        .iter()
        .filter(|(path, _)| path.starts_with(STORY_ROOT) && path.ends_with(".json"))
        .map(|(path, text)| (path.as_str(), serde_json::from_str(text).map_err(|error| error.to_string())))
        .collect();
    let mut found = Vec::new();
    let cast = parsed.iter().find(|(path, _)| *path == CAST).and_then(|(_, value)| value.as_ref().ok());
    let speakers = match cast {
        Some(cast) => {
            let (problems, speakers) = check_cast(cast);
            found.extend(problems);
            speakers
        }
        None => Vec::new(),
    };
    for (path, value) in &parsed {
        let value = match value {
            Ok(value) => value,
            Err(why) => {
                found.push(problem(path, format!("not JSON the check can read: {why}")));
                continue;
            }
        };
        if *path == CAST {
            continue;
        }
        if cast.is_none() {
            found.push(problem(path, format!("its speakers need the cast, {CAST}")));
        }
        let Some(scenes) = value.get("scenes").and_then(Value::as_object) else {
            found.push(problem(path, "a story file holds its scenes under \"scenes\"".to_owned()));
            continue;
        };
        if scenes.contains_key(PROTOTYPE_KEY) {
            found.push(problem(path, format!("the scenes cannot hold the key \"{PROTOTYPE_KEY}\"")));
        }
        for (scene, lines) in scenes.iter().filter(|(scene, _)| *scene != PROTOTYPE_KEY) {
            found.extend(check_scene(path, scene, lines, &speakers));
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    const VOICE: &str = r#"{"pitchHz": 100, "spreadHz": 0, "muffleHz": 1500, "volume": 0.3, "syllableS": 0.1}"#;

    fn cast_text() -> String {
        format!(r#"{{"speakers": {{"mate": {{"name": "Mate", "voice": "low"}}}}, "voices": {{"low": {VOICE}}}}}"#)
    }

    fn checked_with(cast: &str, scene: &str) -> Vec<String> {
        let files = vec![
            (CAST.to_owned(), cast.to_owned()),
            ("content/story/one.json".to_owned(), format!(r#"{{"scenes": {{"deck": {scene}}}}}"#)),
        ];
        check(&files).into_iter().map(|found| found.message).collect()
    }

    fn checked(scene: &str) -> Vec<String> {
        checked_with(&cast_text(), scene)
    }

    #[test]
    fn short_plain_lines_pass() {
        let scene = r#"[{"who": "mate", "say": "Hold fast.", "emote": "fear"},
            {"who": "mate", "say": "Ships!", "kind": "bark", "emote": "alert"}]"#;
        assert_eq!(checked(scene), Vec::<String>::new());
    }

    #[test]
    fn the_story_as_it_stands_passes() {
        let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../../");
        let files: Vec<(String, String)> = ["content/story/cast.json", "content/story/prologue.json"]
            .iter()
            .map(|path| ((*path).to_owned(), std::fs::read_to_string(format!("{root}{path}")).expect(path)))
            .collect();
        assert_eq!(check(&files).into_iter().map(|found| found.message).collect::<Vec<_>>(), Vec::<String>::new());
    }

    #[test]
    fn dashes_and_ellipses_are_refused() {
        for said in ["Wait \u{2014} there.", "Wait \u{2013} there.", "Wait -- there.", "Wait\u{2026}", "Wait..."] {
            let found = checked(&format!(r#"[{{"who": "mate", "say": "{said}"}}]"#));
            assert_eq!(found.len(), 1, "{said}: {found:?}");
            assert!(found.iter().all(|message| message.contains("a pause is a full stop")));
        }
    }

    #[test]
    fn long_lines_and_long_barks_are_refused() {
        let long = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen";
        assert_eq!(checked(&format!(r#"[{{"who": "mate", "say": "{long}"}}]"#)).len(), 1);
        let bark = r#"[{"who": "mate", "say": "Ships off the port bow!", "kind": "bark"}]"#;
        assert!(checked(bark)[0].contains("a bark holds 4"));
    }

    #[test]
    fn a_speaker_not_in_the_cast_or_a_story_without_a_cast_is_refused() {
        assert_eq!(checked(r#"[{"who": "stranger", "say": "Hello."}]"#).len(), 1, "not in the cast");
        let alone = vec![("content/story/one.json".to_owned(), r#"{"scenes": {}}"#.to_owned())];
        assert_eq!(check(&alone).len(), 1, "a story without its cast");
    }

    #[test]
    fn a_cast_the_speech_system_would_refuse_is_refused() {
        let line = r#"[{"who": "mate", "say": "Aye."}]"#;
        let with_speaker =
            |speaker: &str| format!(r#"{{"speakers": {{"mate": {speaker}}}, "voices": {{"low": {VOICE}}}}}"#);
        let unvoiced = checked_with(&with_speaker(r#"{"name": "Mate", "voice": "high"}"#), line);
        assert!(
            unvoiced.iter().any(|message| message.contains("\"high\" is not in the cast's voices")),
            "{unvoiced:?}"
        );
        assert!(unvoiced.iter().any(|message| message.contains("not a speaker in the cast with a voice")));
        let nameless = checked_with(&with_speaker(r#"{"voice": "low"}"#), line);
        assert_eq!(nameless, vec!["speaker \"mate\" has no name".to_owned()]);
        let quick = VOICE.replace("0.1}", "0.03}");
        let rushed = checked_with(&cast_text().replace(VOICE, &quick), line);
        assert_eq!(rushed.len(), 1, "{rushed:?}");
        assert!(rushed[0].contains("syllableS under 0.04"));
        for (number, value) in [("pitchHz", "0"), ("volume", "-1"), ("muffleHz", "\"loud\""), ("spreadHz", "-2")] {
            let broken = VOICE.replace(&format!(r#""{number}": "#), &format!(r#""{number}": {value}, "was": "#));
            let found = checked_with(&cast_text().replace(VOICE, &broken), line);
            assert_eq!(found, vec![format!("voice \"low\" has no usable {number}")], "{number} {value}");
        }
        assert_eq!(checked_with(r#"{"speakers": {}}"#, "[]"), vec!["the cast's voices are not an object".to_owned()]);
    }

    #[test]
    fn a_key_that_would_set_a_prototype_is_refused_as_a_speaker_a_voice_or_a_scene() {
        let line = r#"[{"who": "mate", "say": "Aye."}]"#;
        let speaker = format!(
            r#"{{"speakers": {{"__proto__": {{"name": "Mate", "voice": "low"}}}}, "voices": {{"low": {VOICE}}}}}"#
        );
        let found = checked_with(&speaker, r#"[{"who": "__proto__", "say": "Aye."}]"#);
        assert!(found.iter().any(|message| message.contains("speakers cannot hold the key")), "{found:?}");
        let voice = format!(
            r#"{{"speakers": {{"mate": {{"name": "Mate", "voice": "__proto__"}}}}, "voices": {{"__proto__": {VOICE}}}}}"#
        );
        let found = checked_with(&voice, line);
        assert!(found.iter().any(|message| message.contains("voices cannot hold the key")), "{found:?}");
        assert!(found.iter().any(|message| message.contains("not a speaker in the cast with a voice")), "{found:?}");
        let files = vec![
            (CAST.to_owned(), cast_text()),
            ("content/story/one.json".to_owned(), format!(r#"{{"scenes": {{"__proto__": {line}}}}}"#)),
        ];
        let found: Vec<String> = check(&files).into_iter().map(|found| found.message).collect();
        assert_eq!(found, vec!["the scenes cannot hold the key \"__proto__\"".to_owned()]);
    }

    #[test]
    fn long_turns_and_long_scenes_are_refused() {
        let three =
            r#"[{"who": "mate", "say": "One."}, {"who": "mate", "say": "Two."}, {"who": "mate", "say": "Three."}]"#;
        assert_eq!(checked(three).len(), 1);
        let nine: Vec<String> =
            (0..9).map(|turn| format!(r#"{{"who": "{}", "say": "Aye."}}"#, ["mate", "x"][turn % 2])).collect();
        let found = checked(&format!("[{}]", nine.join(",")));
        assert!(found.iter().any(|message| message.contains("holds 9 lines")), "{found:?}");
    }

    #[test]
    fn a_line_with_no_words_and_a_file_with_no_scenes_are_refused() {
        assert_eq!(checked(r#"[{"who": "mate"}]"#).len(), 1);
        assert_eq!(checked(r#"[{"who": "mate", "say": ""}]"#).len(), 1, "empty words");
        assert_eq!(checked(r#"[{"who": "mate", "say": "   "}]"#).len(), 1, "only spaces");
        assert_eq!(checked("[{\"who\": \"mate\", \"say\": \"\u{feff}\"}]").len(), 1, "a byte-order mark");
        let bare = vec![(CAST.to_owned(), cast_text()), ("content/story/two.json".to_owned(), "{}".to_owned())];
        assert_eq!(check(&bare).len(), 1);
        let broken = vec![(CAST.to_owned(), cast_text()), ("content/story/two.json".to_owned(), "{".to_owned())];
        assert_eq!(check(&broken).len(), 1);
    }

    #[test]
    fn a_scene_not_a_list_a_line_not_an_object_and_an_unknown_kind_or_emote_are_refused() {
        assert_eq!(checked(r#"{"who": "mate", "say": "Aye."}"#), vec!["scene \"deck\" is not a list of lines"]);
        assert_eq!(checked(r#"["Aye."]"#), vec!["scene \"deck\", line 1 is not an object"]);
        let shout = checked(r#"[{"who": "mate", "say": "Aye.", "kind": "shout"}]"#);
        assert_eq!(shout, vec!["scene \"deck\", line 1: kind \"shout\" is not \"bark\""]);
        let glee = checked(r#"[{"who": "mate", "say": "Aye.", "emote": "glee"}]"#);
        assert_eq!(glee.len(), 1);
        assert!(glee[0].contains("emote \"glee\" is not one of alert"), "{glee:?}");
    }

    /// The check's copy of what the speech system knows stays the speech system's own.
    #[test]
    fn the_emotes_and_the_shortest_syllable_are_the_speech_systems() {
        let cast = include_str!("../../../../client/src/speech/cast.ts");
        let kinds = cast.split("EMOTE_KINDS = [").nth(1).and_then(|rest| rest.split(']').next()).expect("EMOTE_KINDS");
        let listed: Vec<&str> = kinds.split(',').map(|kind| kind.trim().trim_matches('\'')).collect();
        assert_eq!(listed, EMOTES);
        assert!(cast.contains(&format!("SHORTEST_SYLLABLE_S = {SHORTEST_SYLLABLE_S};")));
    }
}
