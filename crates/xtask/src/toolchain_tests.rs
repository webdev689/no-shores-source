use super::{Part, STEPS};

fn names(part: Part) -> Vec<&'static str> {
    STEPS.iter().filter(|step| step.parts.contains(&part)).map(|step| step.name).collect()
}

#[test]
fn every_step_runs_in_a_part_so_ci_s_parts_together_check_what_the_whole_check_does() {
    let lost: Vec<_> = STEPS.iter().filter(|step| step.parts.is_empty()).map(|step| step.name).collect();
    assert!(lost.is_empty(), "{lost:?}");
}

#[test]
fn each_part_makes_the_messages_first_and_the_page_s_tests_come_after_what_they_read() {
    for part in [Part::Rest, Part::Rust, Part::Page] {
        assert_eq!(names(part).first(), Some(&"messages (FlatBuffers)"), "{part:?}");
    }
    let page = names(Part::Page);
    let at = |name: &str| page.iter().position(|each| each.starts_with(name)).expect(name);
    for read in ["tests' files", "rules for the browser"] {
        assert!(at(read) < at("tests (TypeScript)"), "{read}");
    }
    assert_eq!(names(Part::Rust), ["messages (FlatBuffers)", "tests (Rust)"]);
}

#[test]
fn a_part_is_named_as_ci_names_it() {
    let parts = ["rest", "rust", "page"].map(Part::named);
    assert_eq!(parts, [Some(Part::Rest), Some(Part::Rust), Some(Part::Page)]);
    assert_eq!(Part::named("all"), None);
}
