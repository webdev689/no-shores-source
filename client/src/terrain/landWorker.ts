import { type LandRules, startLand } from '../rules/landRules.ts';
import { shoreField } from '../water/shore.ts';
import type { LandAnswer, LandRequest } from './landClient.ts';

/** The worker's own scope: the DOM library types the page's, so the two calls it needs are named here. */
const scope = globalThis as unknown as {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<{ ticket: number; request: LandRequest }>) => void,
  ): void;
  postMessage(message: LandAnswer, transfer: Transferable[]): void;
};

const land = fetch(`${import.meta.env.BASE_URL}land.wasm`)
  .then((answer) => {
    if (!answer.ok) throw new Error(`land.wasm: ${answer.status}`);
    return answer.arrayBuffer();
  })
  .then(startLand);

function answer(rules: LandRules, ticket: number, request: LandRequest): void {
  if (request.kind === 'dab') {
    const patch = rules.dab(request.brush, request.point, request.starts);
    scope.postMessage({ ticket, patch }, [patch.heights.buffer]);
    return;
  }
  if (request.kind === 'ground') {
    const ground = rules.patch(request.left, request.top, request.step, request.width, request.height);
    const shore = shoreField(ground);
    const moved = [ground.heights, ground.water, ground.edges, ground.marks, shore.levels, shore.shore].map(
      (values) => values.buffer,
    );
    scope.postMessage({ ticket, ground, shore }, moved);
    return;
  }
  if (request.kind === 'city') {
    scope.postMessage({ ticket, text: rules.cityPlan() }, []);
    return;
  }
  if (request.kind === 'window') {
    scope.postMessage({ ticket, text: rules.window(...request.rect) }, []);
    return;
  }
  if (request.kind === 'boxes') {
    scope.postMessage({ ticket, boxes: rules.boxes(...request.rect) }, []);
    return;
  }
  if (request.kind === 'sail') {
    const sailed = rules.sail(request.ship, request.helm, request.time, request.ticks);
    scope.postMessage({ ticket, sailed }, [sailed.ship.buffer]);
    return;
  }
  if (request.kind === 'fight-begin' || request.kind === 'fight-step') {
    const fight =
      request.kind === 'fight-begin'
        ? rules.fightBegin(request.ship, request.seed, request.time, request.captains)
        : rules.fightStep(request.orders, request.time, request.ticks);
    scope.postMessage({ ticket, fight }, []);
    return;
  }
  if (request.kind === 'fight-end') {
    rules.fightEnd();
    scope.postMessage({ ticket }, []);
    return;
  }
  if (request.kind === 'write') {
    scope.postMessage({ ticket, written: rules.write() }, []);
    return;
  }
  const view =
    request.kind === 'open'
      ? rules.open(request.layoutText, request.id, request.editsText, request.keep, request.rmbText)
      : request.kind === 'settle'
        ? rules.settle()
        : rules.setEdits(request.editsText);
  scope.postMessage({ ticket, view }, [view.heights.buffer, view.lakes.buffer, view.coast.buffer, view.across.buffer]);
}

scope.addEventListener('message', (event) => {
  const { ticket, request } = event.data;
  land
    .then((rules) => answer(rules, ticket, request))
    .catch((error: unknown) => {
      scope.postMessage({ ticket, error: error instanceof Error ? error.message : String(error) }, []);
    });
});
