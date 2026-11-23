//! Which cities are ports. Three port cities remain: Overlook in home waters, Sunspire and Rimeholt in the Grey
//! Tithe's; the other six cities are desolate and destroyed, no longer ports. The city crate, the traffic and the page all read this list.

/// The port cities by city id: Overlook (home), Sunspire (the Grey Tithe's first island) and Rimeholt (the Grey
/// Tithe's seat).
pub const MAIN_PORTS: [&str; 3] = ["overlook", "sunspire", "rimeholt"];

/// Whether a city, by its id, is one of the port cities.
#[must_use]
pub fn is_main_port(city_id: &str) -> bool {
    MAIN_PORTS.contains(&city_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_three_port_cities_are_ports() {
        for city in ["overlook", "sunspire", "rimeholt"] {
            assert!(is_main_port(city), "{city}");
        }
        for city in ["cairnwatch", "elmhaven", "goldreach", "mistfall", "windmere", "fenhallow", "Overlook", ""] {
            assert!(!is_main_port(city), "{city}");
        }
    }
}
