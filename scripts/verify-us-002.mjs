import fs from 'node:fs';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';

const source = fs.readFileSync('src/simulation/world.ts', 'utf8');
const compiled = transpileModule(source, {
  compilerOptions: {
    module: ModuleKind.CommonJS,
    target: ScriptTarget.ES2022,
    strict: true,
  },
});

const moduleProxy = { exports: {} };
const requireLike = () => {
  throw new Error('Runtime imports should have been type-erased.');
};

const loadSimulation = new Function('require', 'module', 'exports', `${compiled.outputText}\nreturn module.exports;`);
const simulationModule = loadSimulation(requireLike, moduleProxy, moduleProxy.exports);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const { createSimulationState, stepSimulation, perceiveForTermite } = simulationModule;

const world = { width: 200, height: 180 };

const generated = createSimulationState({
  world,
  termiteCount: 12,
  woodchipCount: 40,
  random: () => 0.42,
});

assert(generated.isInitialized === true, 'Simulation should initialize state');
assert(generated.termites.length === 12, 'Regenerate should create requested termite count');
assert(generated.woodchips.length === 40, 'Regenerate should create requested woodchip count');
assert(
  generated.termites.every((t) => t.x >= 0 && t.x <= world.width && t.y >= 0 && t.y <= world.height),
  'All termites are spawned within world bounds',
);
assert(
  generated.woodchips.every((chip) => chip.x >= 0 && chip.x <= world.width && chip.y >= 0 && chip.y <= world.height),
  'All woodchips are spawned within world bounds',
);

const next = stepSimulation(generated);
assert(next.tick === 1, 'stepSimulation must increment tick');
assert(
  next.signalFields.length > 0,
  'Simulation step should update and carry signal fields',
);

const localState = {
  isInitialized: true,
  tick: 0,
  world,
  termites: [
    {
      id: 'observer',
      x: 50,
      y: 60,
      heading: 0,
    },
  ],
  woodchips: [
    { id: 'near', x: 80, y: 60, collected: false },
    { id: 'far', x: 140, y: 60, collected: false },
  ],
  signalFields: [
    { id: 'signal-near', x: 70, y: 60, intensity: 1 },
    { id: 'signal-far', x: 10, y: 10, intensity: 1 },
  ],
};

const perception = perceiveForTermite(localState, localState.termites[0], 35);
assert(perception.nearbyWoodchips.length === 1, 'Perception should include only nearby woodchips by radius.');
assert(perception.nearbyWoodchips[0]?.id === 'near', 'Perception should select the nearest local chip.');
assert(perception.nearbySignals.length === 1, 'Perception should include only nearby signal fields by radius.');

const signalOnly = {
  ...localState,
  signalFields: [{ id: 'signal', x: 50, y: 60, intensity: 1 }],
  termites: [
    {
      id: 'mover',
      x: 30,
      y: 30,
      heading: 0,
    },
  ],
  woodchips: [],
};

const decayed = stepSimulation(signalOnly, { signalDecay: 0.4, signalDeposit: 0, minSignalIntensity: 0.1, perceptionRadius: 30 });
assert(
  decayed.signalFields.some((field) => Math.abs(field.intensity - 0.4) < 0.0001),
  'Signals should preserve and decay local fields consistently each tick',
);

console.log('US-002 focused verification passed: local-perception + bounded regeneration + signal updates.');
