// What the wreck's tests share: the wreck as laid, a story that writes down every call made of it, scenery that draws
// nothing, a frame's tick and the foot view's answers.
import type { InputFrame } from '../../player/input.ts';
import type { Story } from './story.ts';
import { readWreck } from './wreckLayout.ts';
import type { WreckScenery } from './wreckScenery.ts';

export const layout = readWreck();
export const SIZE = { width: 960, height: 540 };

/** A story whose every part takes any call and writes it down, by its path and what it was handed; a call whose path
 *  `answers` names gives back what it holds there, and a part `values` names is what it holds. Its player wears
 *  `dress`. */
export function recorded(
  answers: Readonly<Record<string, unknown>> = {},
  values: Readonly<Record<string, unknown>> = {},
  dress: unknown = { body: 'female' },
): { story: Story; calls: string[] } {
  const calls: string[] = [];
  // The storm's lightning is still unless a test says otherwise.
  const answered: Readonly<Record<string, unknown>> = {
    'lightning.step': { flash: 0, bolt: null },
    // A scene is said at once, so a beat that waits for its scene goes on.
    'stage.play': Promise.resolve(),
    ...answers,
  };
  const part = (path: string): unknown =>
    path in values
      ? values[path]
      : new Proxy(() => undefined, {
          get: (target, key) => (key === 'then' ? undefined : part(`${path}.${String(key)}`)),
          set: () => true,
          apply: (target, self, args: unknown[]) => {
            calls.push(`${path}(${args.filter((arg) => typeof arg !== 'object').join(', ')})`);
            return answered[path];
          },
        });
  const story = new Proxy({ dress } as object, {
    get: (target, key) => (key === 'dress' ? Reflect.get(target, key) : part(String(key))),
  });
  return { story: story as Story, calls };
}

export const scenery = { drawer: { drawInto: () => undefined } } as unknown as WreckScenery;
export const tick = (seconds: number) => ({
  seconds,
  clock: 0,
  controls: { held: () => false, locked: false } as unknown as InputFrame,
  size: SIZE,
  viewport: SIZE,
});

/** The foot view's answers: what it lays under the fight and over it. */
export const FOOT_VIEW = { 'stage.parts.footView.frame': { under: {}, over: {} } };
