use super::Problem;

/// A database migration's name: its UTC timestamp to the second, then what it does.
fn timestamped(name: &str) -> bool {
    let Some((stamp, rest)) = name.split_once('_') else { return false };
    let digits = |from: usize, to: usize| stamp.get(from..to).and_then(|part| part.parse::<u32>().ok());
    stamp.len() == 14
        && stamp.bytes().all(|byte| byte.is_ascii_digit())
        && digits(4, 6).is_some_and(|month| (1..=12).contains(&month))
        && digits(6, 8).is_some_and(|day| day >= 1 && day <= days_in(digits(0, 4), digits(4, 6)))
        && digits(8, 10).is_some_and(|hour| hour < 24)
        && digits(10, 12).is_some_and(|minute| minute < 60)
        && digits(12, 14).is_some_and(|second| second < 60)
        && rest.len() > ".sql".len()
}

/// The days of a month of a year, by the Gregorian calendar; 31 where either is unread.
fn days_in(year: Option<u32>, month: Option<u32>) -> u32 {
    let leap = year.is_some_and(|year| (year % 4 == 0 && year % 100 != 0) || year % 400 == 0);
    match month {
        Some(2) => 28 + u32::from(leap),
        Some(4 | 6 | 9 | 11) => 30,
        _ => 31,
    }
}

/// Every migration is named by when it was made, so two branches never claim the same number.
pub fn check(files: &[String]) -> Vec<Problem> {
    files
        .iter()
        .filter(|path| path.to_ascii_lowercase().ends_with(".sql") && path.contains("/migrations/"))
        .filter(|path| !timestamped(path.rsplit('/').next().unwrap_or(path)))
        .map(|path| {
            Problem::new(
                "versions",
                path,
                None,
                "a migration is named by its UTC timestamp and what it does: 20261117210000_accounts.sql",
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn checked(path: &str) -> usize {
        check(&[path.to_owned()]).len()
    }

    #[test]
    fn a_migration_is_named_by_its_timestamp() {
        assert_eq!(checked("server/accounts/migrations/20261117210000_accounts.sql"), 0);
        assert_eq!(checked("server/accounts/migrations/0001_accounts.sql"), 1, "a counter");
        assert_eq!(checked("server/accounts/migrations/20261317210000_accounts.sql"), 1, "no thirteenth month");
        assert_eq!(checked("server/accounts/migrations/20261117210000.sql"), 1, "and says what it does");
        assert_eq!(checked("server/accounts/migrations/20261117210000_.sql"), 1);
        assert_eq!(checked("server/accounts/migrations/20260231210000_accounts.sql"), 1, "no thirty-first of February");
        assert_eq!(checked("server/accounts/migrations/20260229210000_accounts.sql"), 1, "2026 is no leap year");
        assert_eq!(checked("server/accounts/migrations/20280229210000_accounts.sql"), 0, "2028 is");
        assert_eq!(checked("server/accounts/migrations/0001_accounts.SQL"), 1, "an ending in any case");
    }

    #[test]
    fn only_migrations_are_read() {
        assert_eq!(checked("tools/setup/0001_seed.sql"), 0);
        assert_eq!(checked("server/accounts/migrations/README.md"), 0);
    }
}
