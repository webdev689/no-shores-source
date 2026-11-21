// A 2D context for tests that records what is painted, each word 6 pixels a letter wide, and how deep its saves go.
import type { Painter } from './mapLetters.ts';

export interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
  readonly fillStyle: unknown;
  readonly strokeStyle: unknown;
}

export function recorder(): {
  painter: Painter;
  calls: Call[];
  texts: () => unknown[];
  depth: () => number;
} {
  const calls: Call[] = [];
  const state = {
    font: '',
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    lineWidth: 1,
    textBaseline: '',
    textAlign: '',
    lineJoin: '',
  };
  let depth = 0;
  const painter = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      if (key === 'measureText') return (text: string) => ({ width: text.length * 6 });
      return (...args: unknown[]) => {
        if (key === 'save') depth++;
        if (key === 'restore') depth--;
        calls.push({ name: String(key), args, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle });
      };
    },
    set(target, key, value) {
      (target as Record<string, unknown>)[key as string] = value;
      return true;
    },
  }) as unknown as Painter;
  const texts = () => calls.filter((call) => call.name === 'fillText').map((call) => call.args[0]);
  return { painter, calls, texts, depth: () => depth };
}
