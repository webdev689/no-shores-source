// The faces a font package's stylesheet declares: each file and the code points it holds, as `@font-face` writes them.

/** The code points a range list holds, as `unicode-range` writes it. */
export function rangesOf(list: string): readonly (readonly [number, number])[] {
  return list.split(',').map((range) => {
    const [from = '0', to = from] = range.trim().replace(/^U\+/i, '').split('-');
    return [Number.parseInt(from, 16), Number.parseInt(to, 16)] as const;
  });
}

/** Each of the package's faces: its file's name and the code points it holds. */
export function facesOf(
  css: string,
): readonly { readonly file: string; readonly ranges: ReturnType<typeof rangesOf> }[] {
  return [...css.matchAll(/url\(\.\/files\/([^)]+)\)[^;]*;\s*unicode-range:\s*([^;]+);/g)].map(
    ([, file = '', list = '']) => ({
      file,
      ranges: rangesOf(list),
    }),
  );
}
