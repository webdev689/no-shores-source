//! How many cases a test that sweeps the world checks. By default a sample, the same on every run so a failure
//! reproduces; every case when `NO_SHORES_FULL_SWEEP` is set to anything but `0`, as the nightly run on `main` does.

/// The variable that asks for every case.
pub const FULL_SWEEP: &str = "NO_SHORES_FULL_SWEEP";

/// Whether this run checks every case.
#[must_use]
pub fn full() -> bool {
    std::env::var_os(FULL_SWEEP).is_some_and(|value| !value.is_empty() && value != "0")
}

/// The cases a sweep checks: all of `cases` on a full sweep, otherwise `keep` of them spread evenly from the first to
/// the last.
#[must_use]
pub fn sample<T>(cases: impl IntoIterator<Item = T>, keep: usize) -> Vec<T> {
    picked(cases.into_iter().collect(), keep, full())
}

fn picked<T>(cases: Vec<T>, keep: usize, full: bool) -> Vec<T> {
    let count = cases.len();
    if full || keep >= count {
        return cases;
    }
    // The nth kept case's index, rounded down: the first is 0 and the last count - 1.
    let wanted: Vec<usize> = (0..keep).map(|nth| if keep == 1 { 0 } else { nth * (count - 1) / (keep - 1) }).collect();
    cases.into_iter().enumerate().filter(|(index, _)| wanted.contains(index)).map(|(_, case)| case).collect()
}

/// The cases a sweep checks: all of `cases` on a full sweep, otherwise each case, in order, that is of a kind (any of
/// those `kinds` names it) no case before it was, so the sample still holds every kind the whole sweep does.
#[must_use]
pub fn one_of_each<T, K: Ord>(cases: impl IntoIterator<Item = T>, kinds: impl Fn(&T) -> Vec<K>) -> Vec<T> {
    firsts(cases, kinds, full())
}

fn firsts<T, K: Ord>(cases: impl IntoIterator<Item = T>, kinds: impl Fn(&T) -> Vec<K>, full: bool) -> Vec<T> {
    let mut seen = std::collections::BTreeSet::new();
    let mut kept = Vec::new();
    for case in cases {
        let mut fresh = false;
        for kind in kinds(&case) {
            fresh |= seen.insert(kind);
        }
        if full || fresh {
            kept.push(case);
        }
    }
    kept
}

#[cfg(test)]
mod tests {
    use super::{firsts, picked};

    #[test]
    fn one_of_each_keeps_each_case_that_brings_a_kind_not_yet_seen() {
        let cases = [("under", "hold"), ("under", "hunt"), ("open", "hold"), ("under", "hold"), ("open", "hunt")];
        fn kinds(case: &(&'static str, &'static str)) -> Vec<&'static str> {
            vec![case.0, case.1]
        }
        assert_eq!(firsts(cases, kinds, false), [("under", "hold"), ("under", "hunt"), ("open", "hold")]);
        assert_eq!(firsts(cases, kinds, true).len(), 5);
    }

    #[test]
    fn a_sample_spreads_from_the_first_case_to_the_last() {
        assert_eq!(picked((0..12).collect(), 3, false), [0, 5, 11]);
        assert_eq!(picked((0..52).collect(), 4, false), [0, 17, 34, 51]);
        assert_eq!(picked((0..5).collect(), 1, false), [0]);
        assert_eq!(picked((0..5).collect(), 0, false), Vec::<i32>::new());
    }

    #[test]
    fn a_full_sweep_or_a_sample_as_big_as_the_cases_keeps_every_case() {
        assert_eq!(picked((0..12).collect(), 3, true), (0..12).collect::<Vec<_>>());
        assert_eq!(picked((0..3).collect(), 5, false), [0, 1, 2]);
    }
}
