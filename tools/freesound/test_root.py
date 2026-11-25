"""root.py on synthetic tones at known notes, with a little noise: a sine and a sawtooth, low and high, and noise alone.

    python3 -I tools/freesound/test_root.py"""
import os
import shutil
import sys
import tempfile
import unittest
import wave

import numpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import publish  # noqa: E402
import root  # noqa: E402

NOISE = numpy.random.default_rng(7)


def hertz_of(midi, cents=0):
    return 440.0 * 2 ** ((midi - 69 + cents / 100) / 12)


def tone(hertz, wave, seconds=2.0):
    """`seconds` of a sine or a sawtooth at `hertz`, an attack and a decay at its ends and noise 30 dB under it."""
    times = numpy.arange(int(root.RATE * seconds)) / root.RATE
    phase = (times * hertz) % 1.0
    body = numpy.sin(2 * numpy.pi * phase) if wave == 'sine' else 2 * phase - 1
    envelope = numpy.minimum(1, numpy.minimum(times / 0.05, (seconds - times) / 0.3))
    return 0.5 * body * envelope + 0.016 * NOISE.standard_normal(len(times))


class Root(unittest.TestCase):
    def test_notes_are_named_with_their_cents(self):
        self.assertEqual(root.note_of(261.63), ('C4', 0))
        self.assertEqual(root.note_of(440.0), ('A4', 0))
        self.assertEqual(root.note_of(hertz_of(48, 20)), ('C3', 20))
        self.assertEqual(root.note_of(hertz_of(37, -30)), ('C#2', -30))

    def test_a_sine_and_a_sawtooth_are_found_at_their_notes(self):
        for midi, cents, shape in [(48, 0, 'sine'), (57, 12, 'saw'), (36, 0, 'saw'), (31, -8, 'sine'), (76, 0, 'saw')]:
            with self.subTest(midi=midi, shape=shape):
                hertz = root.fundamental(tone(hertz_of(midi, cents), shape))
                self.assertIsNotNone(hertz)
                name, found = root.note_of(hertz)
                self.assertEqual(name, root.note_of(hertz_of(midi))[0])
                self.assertLessEqual(abs(found - cents), 3)

    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg reads the file')
    def test_a_file_is_decoded_and_found(self):
        samples = (numpy.clip(tone(hertz_of(45), 'saw'), -1, 1) * 32767).astype('<i2')
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'tone.wav')
            with wave.open(path, 'wb') as file:
                file.setnchannels(1)
                file.setsampwidth(2)
                file.setframerate(root.RATE)
                file.writeframes(samples.tobytes())
            self.assertEqual(root.note_of(root.fundamental(root.decoded(path)))[0], 'A2')

    def test_a_root_is_written_with_its_cents(self):
        self.assertEqual(root.root_text('C3', 0), 'C3')
        self.assertEqual(root.root_text('C3', -38), 'C3-38')
        self.assertEqual(root.root_text('F#2', 12), 'F#2+12')
        for text in ['C3', 'C3-38', 'F#2+12', 'C-1-5']:
            self.assertRegex(text, publish.ROOT)

    def test_noise_has_no_steady_pitch(self):
        self.assertIsNone(root.fundamental(0.3 * NOISE.standard_normal(root.RATE * 2)))


if __name__ == '__main__':
    unittest.main()
