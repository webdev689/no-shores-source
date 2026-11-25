// OKLab, the colour space whose distances are near what the eye sees, for every layer that weighs colours: the
// forge snapping to its palette, and the tests that keep colours apart.

/** A colour in OKLab: L its lightness, a and b its hue and chroma, each step about as far to the eye. */
export function oklab(red: number, green: number, blue: number): [number, number, number] {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const [linRed, linGreen, linBlue] = [linear(red), linear(green), linear(blue)];
  const long = Math.cbrt(0.4122214708 * linRed + 0.5363325363 * linGreen + 0.0514459929 * linBlue);
  const middle = Math.cbrt(0.2119034982 * linRed + 0.6806995451 * linGreen + 0.1073969566 * linBlue);
  const short = Math.cbrt(0.0883024619 * linRed + 0.2817188376 * linGreen + 0.6299787005 * linBlue);
  return [
    0.2104542553 * long + 0.793617785 * middle - 0.0040720468 * short,
    1.9779984951 * long - 2.428592205 * middle + 0.4505937099 * short,
    0.0259040371 * long + 0.7827717662 * middle - 0.808675766 * short,
  ];
}
