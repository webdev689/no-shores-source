"""Finds the root of a pitched pick for the music's sampled voices: decodes its preview (ffmpeg), finds its fundamental
by YIN over its steady middle and prints the nearest note and its cents off it as the `root` its cue in
content/audio/freesound.json is given ("C3-38", 38 cents flat of C3), from which the song player plays every other
note; publish.py copies it onto the pick's entry in content/audio/sounds.json.

    python3 -I tools/freesound/root.py <preview.mp3>...

It decodes a stranger's audio, so it runs where no key is held."""
import re
import shutil
import subprocess
import sys

try:
    import numpy
except ImportError:  # publish.py reads ROOT on the freesound workflow's machine, which has no numpy
    numpy = None

RATE = 44100
# A root as written: a note ("C3", "F#2", "Bb1") and, where it is off it, its cents (the game's rootNote reads it).
ROOT = re.compile(r'[A-G](#|b)?-?\d([+-]\d{1,2})?')
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
# The lowest and highest fundamentals looked for, hertz: C1 to B5, the scores' whole range.
LOWEST_HZ = 32.0
HIGHEST_HZ = 1000.0
# A dip of YIN's normalised difference under this is a period; frames with none are not steady and are passed over.
THRESHOLD = 0.15
# A frame's length and its step, samples: two periods of the lowest note fit in its half.
FRAME = 4096
STEP = 1024


def decoded(path):
    """A file's samples, one channel at RATE, as floats."""
    if not shutil.which('ffmpeg'):
        sys.exit('ffmpeg is needed to read a recording')
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return numpy.frombuffer(raw, dtype=numpy.float32).astype(numpy.float64)


def steady_middle(samples):
    """The middle half of a recording, past its attack and before its tail."""
    quarter = len(samples) // 4
    return samples[quarter:len(samples) - quarter]


def frame_period(frame):
    """One frame's period in samples by YIN (de Cheveigné and Kawahara), or None where it holds no steady pitch."""
    half = len(frame) // 2
    shortest, longest = int(RATE / HIGHEST_HZ), min(half - 2, int(RATE / LOWEST_HZ))
    # The difference d(tau) = sum (x_j - x_{j+tau})^2 over the frame's first half, from its energies and an
    # autocorrelation taken by the FFT.
    head = frame[:half]
    size = 1 << int(numpy.ceil(numpy.log2(len(frame) + half)))
    correlation = numpy.fft.irfft(numpy.fft.rfft(frame, size) * numpy.conj(numpy.fft.rfft(head, size)), size)[:half]
    squares = numpy.concatenate(([0.0], numpy.cumsum(frame ** 2)))
    taus = numpy.arange(half)
    energy_late = squares[taus + half] - squares[taus]
    difference = squares[half] + energy_late - 2 * correlation
    difference[0] = 0
    # Normalised by its running mean, so the first dip under the threshold is the period, not a multiple of it.
    running = numpy.cumsum(difference[1:]) / numpy.arange(1, half)
    normalised = numpy.ones(half)
    normalised[1:] = difference[1:] / numpy.maximum(running, 1e-12)
    under = numpy.nonzero(normalised[shortest:longest] < THRESHOLD)[0]
    if len(under) == 0:
        return None
    tau = shortest + under[0]
    while tau + 1 < longest and normalised[tau + 1] < normalised[tau]:
        tau += 1
    # The dip's true place between samples, by the parabola through it and its neighbours.
    before, at, after = normalised[tau - 1], normalised[tau], normalised[tau + 1]
    bend = before - 2 * at + after
    return tau + (0.5 * (before - after) / bend if bend > 0 else 0.0)


def fundamental(samples):
    """A recording's fundamental, hertz: the median of its steady middle's frames; None with no steady pitch."""
    middle = steady_middle(samples)
    periods = [frame_period(middle[start:start + FRAME]) for start in range(0, len(middle) - FRAME, STEP)]
    found = [period for period in periods if period]
    return RATE / float(numpy.median(found)) if found else None


def note_of(hertz):
    """The note nearest `hertz` ("C3", middle C C4) and its cents off it."""
    midi = 69 + 12 * numpy.log2(hertz / 440.0)
    nearest = int(round(midi))
    return f'{NAMES[nearest % 12]}{nearest // 12 - 1}', round(100 * (midi - nearest))


def root_text(name, cents):
    """A root as freesound.json writes it: the note, and its cents off it where it is off ("C3", "C3-38")."""
    return f'{name}{cents:+d}' if cents else name


def main():
    paths = sys.argv[1:]
    if not paths:
        sys.exit(__doc__)
    if numpy is None:
        sys.exit('numpy is needed to measure a root')
    for path in paths:
        hertz = fundamental(decoded(path))
        if hertz is None:
            print(f'{path}: no steady pitch (a percussive or textural pick plays from its home)')
            continue
        name, cents = note_of(hertz)
        print(f'{path}: root "{root_text(name, cents)}" ({hertz:.1f} Hz)')


if __name__ == '__main__':
    main()
