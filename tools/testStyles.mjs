// Node runs the client's tests without Vite: a stylesheet a module imports is read as an empty module, as Vite lays
// it on the page rather than in the module.
import { registerHooks } from 'node:module';

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    return nextLoad(url, context);
  },
});
