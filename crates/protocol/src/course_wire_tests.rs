//! The course message's asks read back: a course's points and pace, a step on deck, the helm, orders, a travel.
use super::*;
use movement::Controls;

#[test]
fn a_course_reads_back_as_its_points_and_pace_and_odd_numbers_are_refused() {
    let points = [[50_000.0, 150_000.5], [51_000.0, 149_000.0]];
    assert_eq!(read_course(&course_bytes(&points, 20)), Ok((points.to_vec(), 20)));
    assert_eq!(read_course(&course_bytes(&[], 5)), Ok((Vec::new(), 5)));
    assert!(read_course(&[1, 2, 3]).is_err());
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let odd = Some(builder.create_vector(&[1.0, 2.0, 3.0]));
    let course =
        messages::Course::create(&mut builder, &messages::CourseArgs { points: odd, pace: 5, ..Default::default() });
    builder.finish(course, None);
    assert_eq!(read_course(builder.finished_data()), Err("a course's points are pairs, not 3 numbers".to_owned()));
}

#[test]
fn a_step_of_a_walk_on_deck_and_the_helm_cross_in_a_course_message() {
    let controls = Controls { forward: 1.0, sideways: -0.5, yaw: 0.25, run: true, ..Controls::default() };
    assert_eq!(read_sea_input(&walk_bytes(12, &controls)), Ok(SeaInput::Walk(12, controls)));
    assert_eq!(read_sea_input(&helm_bytes(true)), Ok(SeaInput::LeaveHelm));
    assert_eq!(read_sea_input(&helm_bytes(false)), Ok(SeaInput::TakeHelm));
    assert_eq!(read_sea_input(&face_bytes(1.25)), Ok(SeaInput::Face(1.25)));
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let (points, facing) = (Some(builder.create_vector(&[1.0, 2.0])), Some(builder.create_vector(&[0.5])));
    let args = messages::CourseArgs { points, facing, ..Default::default() };
    let both = messages::Course::create(&mut builder, &args);
    builder.finish(both, None);
    assert!(read_sea_input(builder.finished_data()).is_err(), "a course's legs turn it, not a facing");
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let facing = Some(builder.create_vector(&[0.5, 1.0]));
    let two = messages::Course::create(&mut builder, &messages::CourseArgs { facing, ..Default::default() });
    builder.finish(two, None);
    assert!(read_sea_input(builder.finished_data()).is_err(), "it faces one heading");
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let walk = Some(builder.create_vector(&[1.0, 0.0]));
    let short = messages::Course::create(&mut builder, &messages::CourseArgs { walk, ..Default::default() });
    builder.finish(short, None);
    assert!(read_sea_input(builder.finished_data()).is_err(), "a step's controls are all its numbers");
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let odd = messages::Course::create(&mut builder, &messages::CourseArgs { helm: 4, ..Default::default() });
    builder.finish(odd, None);
    assert!(read_sea_input(builder.finished_data()).is_err(), "the helm is left or taken, or a chase, nothing else");
    assert_eq!(read_sea_input(&chase_bytes(7)), Ok(SeaInput::Chase(Some(7))), "a chase of ship 7");
    assert_eq!(read_sea_input(&chase_bytes(0)), Ok(SeaInput::Chase(None)), "the chase let go");
    let asked = |ask: u8| {
        let mut builder = flatbuffers::FlatBufferBuilder::new();
        let course = messages::Course::create(&mut builder, &messages::CourseArgs { ask, ..Default::default() });
        builder.finish(course, None);
        read_sea_input(builder.finished_data())
    };
    assert_eq!(asked(4), Ok(SeaInput::Chart), "the held map raised at the helm");
    assert!(asked(5).is_err(), "no ask past the chart's");
}

#[test]
fn orders_cross_in_a_course_message_and_a_course_without_them_is_a_course() {
    let orders = Orders {
        helm: sailing::ship::Helm { steer: 0.5, climb: -1 },
        aim: None,
        fire: true,
        brace: false,
        load: None,
        boost: true,
    };
    assert_eq!(read_sea_input(&orders_bytes(&orders)), Ok(SeaInput::Orders(orders)));
    assert_eq!(read_sea_input(&course_bytes(&[[1.0, 2.0]], 5)), Ok(SeaInput::Course(vec![[1.0, 2.0]], 5)));
}

#[test]
fn a_course_asked_with_the_travel_flag_reads_as_a_travel_and_one_without_as_a_course() {
    let points = vec![[50_000.0, 150_000.0], [550_000.0, 150_000.0]];
    assert_eq!(read_sea_input(&travel_bytes(&points, 20)), Ok(SeaInput::Travel(points.clone(), 20)));
    assert_eq!(read_sea_input(&course_bytes(&points, 20)), Ok(SeaInput::Course(points, 20)));
}
