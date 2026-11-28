use super::{Part, STEPS, Share, rust_tests};
use std::path::Path;

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

#[test]
fn the_rust_tests_are_named_whole_archived_or_shared_from_an_archive() {
    assert_eq!(Share::named(&[]), Some(Share::All));
    assert_eq!(Share::named(&["archive", "t.tar.zst"]), Some(Share::Archive("t.tar.zst")));
    assert_eq!(Share::named(&["1/2"]), Some(Share::Slice("1/2", None)));
    assert_eq!(Share::named(&["2/2", "t.tar.zst"]), Some(Share::Slice("2/2", Some("t.tar.zst"))));
    for wrong in [&["archive"][..], &["1/2", "a", "b"], &["page", "t.tar.zst"]] {
        assert_eq!(Share::named(wrong), None, "{wrong:?}");
    }
}

#[test]
fn a_share_run_from_an_archive_runs_what_another_runner_built_in_this_checkout() {
    let root = Path::new("/repo");
    let archive = ["nextest", "archive", "--workspace", "--locked", "--archive-file", "a.tar.zst"];
    assert_eq!(rust_tests(Share::Archive("a.tar.zst"), root), archive);
    let from = ["--archive-file", "a.tar.zst", "--workspace-remap", "/repo"];
    let run = [&["nextest", "run"][..], &from, &["--no-fail-fast", "--partition", "slice:1/2"]].concat();
    assert_eq!(rust_tests(Share::Slice("1/2", Some("a.tar.zst")), root), run);
    let here = ["nextest", "run", "--workspace", "--locked", "--no-fail-fast", "--partition", "slice:2/2"];
    assert_eq!(rust_tests(Share::Slice("2/2", None), root), here);
    assert_eq!(rust_tests(Share::All, root), ["nextest", "run", "--workspace", "--locked", "--no-fail-fast"]);
}

#[test]
fn the_page_builds_the_tests_that_write_its_files_at_once_before_running_each() {
    let files: Vec<_> =
        STEPS.iter().filter(|step| step.parts.contains(&Part::Page) && step.name.starts_with("tests' files")).collect();
    let (built, runs) = files.split_first().expect("the page's tests' files");
    assert!(built.args.contains(&"--no-run"), "{built:?}");
    let packages = |args: &[&'static str]| -> Vec<&'static str> {
        args.windows(2).filter(|pair| pair[0] == "-p").map(|pair| pair[1]).collect()
    };
    let run: Vec<_> = runs.iter().flat_map(|step| packages(step.args)).collect();
    assert_eq!(packages(built.args), run);
}
