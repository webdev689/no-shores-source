use super::Problem;
use serde_json::Value;

/// Where the story's lines live: the cast (each speaker's name and voice) and every mission's scenes beside it.
pub const STORY_ROOT: &str = "content/story/";
const CAST: &str = "content/story/cast.json";

/// The Dialogue rule's numbers: words a line, words a bark, lines one speaker says in a row, lines a scene.
const LINE_WORDS: usize = 14;
const BARK_WORDS: usize = 4;
const TURN_LINES: usize = 2;
const SCENE_LINES: usize = 8;

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

/// The speakers the cast names who have a voice to speak in.
fn voiced(cast: &Value) -> Vec<String> {
    let Some(speakers) = cast.get("speakers").and_then(Value::as_object) else { return Vec::new() };
    let voices = cast.get("voices").and_then(Value::as_object);
    speakers
        .iter()
        .filter(|(_, speaker)| {
            let voice = speaker.get("voice").and_then(Value::as_str);
            voice.is_some_and(|name| voices.is_some_and(|all| all.contains_key(name)))
        })
        .map(|(key, _)| key.clone())
        .collect()
}

/// One scene's lines held to the rule: each line's words and marks, its speaker's voice, the turns and the length.
fn check_scene(file: &str, scene: &str, lines: &[Value], speakers: &[String]) -> Vec<Problem> {
    let mut found = Vec::new();
    if lines.len() > SCENE_LINES {
        found
            .push(problem(file, format!("scene \"{scene}\" holds {} lines; a scene holds {SCENE_LINES}", lines.len())));
    }
    let (mut last, mut run) = (String::new(), 0);
    for (index, line) in lines.iter().enumerate() {
        let at = format!("scene \"{scene}\", line {}", index + 1);
        let who = line.get("who").and_then(Value::as_str).unwrap_or_default();
        let Some(said) = line.get("say").and_then(Value::as_str) else {
            found.push(problem(file, format!("{at} says nothing: every line has its words in \"say\"")));
            continue;
        };
        if !speakers.iter().any(|speaker| speaker == who) {
            found.push(problem(file, format!("{at}: \"{who}\" is not a speaker in the cast with a voice")));
        }
        let bark = line.get("kind").and_then(Value::as_str) == Some("bark");
        let (words, most) = (said.split_whitespace().count(), if bark { BARK_WORDS } else { LINE_WORDS });
        if words > most {
            let kind = if bark { "a bark" } else { "a line" };
            found.push(problem(file, format!("{at} holds {words} words; {kind} holds {most}")));
        }
        for (mark, name) in BANNED {
            if said.contains(mark) {
                found.push(problem(file, format!("{at} holds {name}: a pause is a full stop")));
            }
        }
        run = if who == last { run + 1 } else { 1 };
        if run == TURN_LINES + 1 {
            found.push(problem(file, format!("{at}: \"{who}\" says more than {TURN_LINES} lines in a row")));
        }
        last = who.to_owned();
    }
    found
}

/// Every scene in the story's files keeps to the Dialogue rule's numbers and marks, spoken by a voiced speaker.
pub fn check(files: &[(String, String)]) -> Vec<Problem> {
    let parsed: Vec<(&str, Result<Value, String>)> = files
        .iter()
        .filter(|(path, _)| path.starts_with(STORY_ROOT) && path.ends_with(".json"))
        .map(|(path, text)| (path.as_str(), serde_json::from_str(text).map_err(|error| error.to_string())))
        .collect();
    let mut found = Vec::new();
    let cast = parsed.iter().find(|(path, _)| *path == CAST).and_then(|(_, value)| value.as_ref().ok());
    let speakers = cast.map(voiced).unwrap_or_default();
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
        for (scene, lines) in scenes {
            let lines = lines.as_array().map(Vec::as_slice).unwrap_or_default();
            found.extend(check_scene(path, scene, lines, &speakers));
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    const CAST_TEXT: &str = r#"{"speakers": {"mate": {"name": "Mate", "voice": "low"},
        "mute": {"name": "Mute"}}, "voices": {"low": {"pitch": 100}}}"#;

    fn checked(scene: &str) -> Vec<String> {
        let files = vec![
            (CAST.to_owned(), CAST_TEXT.to_owned()),
            ("content/story/one.json".to_owned(), format!(r#"{{"scenes": {{"deck": {scene}}}}}"#)),
        ];
        check(&files).into_iter().map(|found| found.message).collect()
    }

    #[test]
    fn short_plain_lines_pass() {
        let scene = r#"[{"who": "mate", "say": "Hold fast."}, {"who": "mate", "say": "Ships!", "kind": "bark"}]"#;
        assert_eq!(checked(scene), Vec::<String>::new());
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
    fn a_speaker_without_a_voice_or_a_cast_is_refused() {
        assert_eq!(checked(r#"[{"who": "mute", "say": "Nothing."}]"#).len(), 1, "no voice");
        assert_eq!(checked(r#"[{"who": "stranger", "say": "Hello."}]"#).len(), 1, "not in the cast");
        let alone = vec![("content/story/one.json".to_owned(), r#"{"scenes": {}}"#.to_owned())];
        assert_eq!(check(&alone).len(), 1, "a story without its cast");
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
        let bare =
            vec![(CAST.to_owned(), CAST_TEXT.to_owned()), ("content/story/two.json".to_owned(), "{}".to_owned())];
        assert_eq!(check(&bare).len(), 1);
        let broken =
            vec![(CAST.to_owned(), CAST_TEXT.to_owned()), ("content/story/two.json".to_owned(), "{".to_owned())];
        assert_eq!(check(&broken).len(), 1);
    }
}
