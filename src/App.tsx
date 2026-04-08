import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  advanceSimulation,
  createSimulationState,
  type SimulationState,
  type Termite,
  type Woodchip,
} from './simulation/world';
import { ControlsPanel } from './ui/controls/ControlsPanel';

const WORLD_WIDTH = 760;
const WORLD_HEIGHT = 420;
const WORLD_CELL_SIZE = 6;
const LOGICAL_WORLD_WIDTH = Math.floor(WORLD_WIDTH / WORLD_CELL_SIZE);
const LOGICAL_WORLD_HEIGHT = Math.floor(WORLD_HEIGHT / WORLD_CELL_SIZE);
const MIN_TICK_INTERVAL_MS = 16;
const MAX_SPEED = 10000;
const FAST_FORWARD_STEPS = 5000;

const DASHBOARD_CARDS = [
  'Total termites',
  'Woodchips remaining',
  'Carried chips',
  'Pickups',
  'Drops',
  'Elapsed ticks',
] as const;

interface SimulationControls {
  termiteCount: number;
  woodchipCount: number;
  speed: number;
}

interface ThroughputStats {
  pickups: number;
  drops: number;
}

interface ClusterMetrics {
  largestPileShare: number;
  pileCount: number;
  trend: number;
}

const DEFAULT_CONTROLS: SimulationControls = {
  termiteCount: 60,
  woodchipCount: 160,
  speed: 12,
};

const DEFAULT_THROUGHPUT: ThroughputStats = {
  pickups: 0,
  drops: 0,
};

const EMPTY_CLUSTER_METRICS: ClusterMetrics = {
  largestPileShare: 0,
  pileCount: 0,
  trend: 0,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampControls(values: SimulationControls): SimulationControls {
  return {
    termiteCount: Math.round(clamp(values.termiteCount, 1, 500)),
    woodchipCount: Math.round(clamp(values.woodchipCount, 0, 1000)),
    speed: clamp(values.speed, 1, MAX_SPEED),
  };
}

function buildScheduler(speed: number): { intervalMs: number; stepsPerFrame: number } {
  const safeSpeed = clamp(speed, 1, MAX_SPEED);
  const rawIntervalMs = Math.floor(1000 / safeSpeed);

  if (rawIntervalMs >= MIN_TICK_INTERVAL_MS) {
    return { intervalMs: rawIntervalMs, stepsPerFrame: 1 };
  }

  return {
    intervalMs: MIN_TICK_INTERVAL_MS,
    stepsPerFrame: Math.max(1, Math.round((safeSpeed * MIN_TICK_INTERVAL_MS) / 1000)),
  };
}

function createSimulationStateFromControls(
  controls: SimulationControls,
  includePopulation: boolean,
): SimulationState {
  const normalizedControls = clampControls(controls);
  return createSimulationState({
    world: { width: LOGICAL_WORLD_WIDTH, height: LOGICAL_WORLD_HEIGHT },
    termiteCount: includePopulation ? normalizedControls.termiteCount : 0,
    woodchipCount: includePopulation ? normalizedControls.woodchipCount : 0,
  });
}

function distanceSq(aX: number, aY: number, bX: number, bY: number): number {
  const dx = aX - bX;
  const dy = aY - bY;
  return dx * dx + dy * dy;
}

function countCarriedChips(termites: Termite[]): number {
  return termites.reduce((count, termite) => count + (termite.carriedChipId === null ? 0 : 1), 0);
}

function makeCellKey(cellX: number, cellY: number): string {
  return `${cellX},${cellY}`;
}

function computeClusterMetrics(woodchips: Woodchip[]): ClusterMetrics {
  const visibleWoodchips = woodchips.filter((chip) => !chip.collected);

  if (visibleWoodchips.length === 0) {
    return EMPTY_CLUSTER_METRICS;
  }

  const cellCounts = new Map<string, number>();

  for (const chip of visibleWoodchips) {
    const key = makeCellKey(chip.x, chip.y);
    cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1);
  }

  const visited = new Set<string>();
  let largestPile = 0;
  let pileCount = 0;

  for (const [startKey] of cellCounts) {
    if (visited.has(startKey)) {
      continue;
    }

    pileCount += 1;
    let pileSize = 0;
    const queue = [startKey];
    visited.add(startKey);

    while (queue.length > 0) {
      const currentKey = queue.pop();
      if (currentKey === undefined) {
        continue;
      }

      pileSize += cellCounts.get(currentKey) ?? 0;
      const [cellX, cellY] = currentKey.split(',').map(Number);

      for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
        for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
          const neighborKey = makeCellKey(cellX + deltaX, cellY + deltaY);
          if (!cellCounts.has(neighborKey) || visited.has(neighborKey)) {
            continue;
          }

          visited.add(neighborKey);
          queue.push(neighborKey);
        }
      }
    }

    largestPile = Math.max(largestPile, pileSize);
  }

  return {
    largestPileShare: Number(((largestPile / visibleWoodchips.length) * 100).toFixed(2)),
    pileCount,
    trend: 0,
  };
}

function formatFloat(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.00';
  }

  return value.toFixed(2);
}

function drawWorld(context: CanvasRenderingContext2D | null, state: SimulationState): void {
  if (!context) {
    return;
  }

  const { world, termites, woodchips } = state;
  const pixelWidth = world.width * WORLD_CELL_SIZE;
  const pixelHeight = world.height * WORLD_CELL_SIZE;

  context.clearRect(0, 0, pixelWidth, pixelHeight);

  context.fillStyle = '#f2f5ff';
  context.fillRect(0, 0, pixelWidth, pixelHeight);

  context.fillStyle = '#4c6ef5';
  for (const chip of woodchips) {
    if (chip.collected) {
      continue;
    }

    context.fillRect(
      chip.x * WORLD_CELL_SIZE + WORLD_CELL_SIZE / 2 - 1.5,
      chip.y * WORLD_CELL_SIZE + WORLD_CELL_SIZE / 2 - 1.5,
      3,
      3,
    );
  }

  context.fillStyle = '#ff9f1c';
  for (const termite of termites) {
    context.fillRect(
      termite.x * WORLD_CELL_SIZE + WORLD_CELL_SIZE / 2 - 1.5,
      termite.y * WORLD_CELL_SIZE + WORLD_CELL_SIZE / 2 - 1.5,
      3,
      3,
    );
  }

  context.strokeStyle = '#222';
  context.strokeRect(0.5, 0.5, pixelWidth - 1, pixelHeight - 1);
}

function advanceSimulationBatch(
  currentState: SimulationState,
  steps: number,
): {
  nextState: SimulationState;
  throughputDelta: ThroughputStats;
  nextClusterMetrics: ClusterMetrics;
} {
  const result = advanceSimulation(currentState, steps, {});
  const nextMetrics = computeClusterMetrics(result.state.woodchips);

  return {
    nextState: result.state,
    throughputDelta: {
      pickups: result.pickups,
      drops: result.drops,
    },
    nextClusterMetrics: nextMetrics,
  };
}

export function App() {
  const [controls, setControls] = useState<SimulationControls>(DEFAULT_CONTROLS);
  const [isRunning, setIsRunning] = useState(true);
  const [state, setState] = useState(() => createSimulationStateFromControls(DEFAULT_CONTROLS, true));
  const [throughput, setThroughput] = useState<ThroughputStats>(DEFAULT_THROUGHPUT);
  const [clusterMetrics, setClusterMetrics] = useState<ClusterMetrics>(EMPTY_CLUSTER_METRICS);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const visibleWoodchips = useMemo(
    () => state.woodchips.filter((chip) => !chip.collected).length,
    [state.woodchips],
  );

  const carriedChips = useMemo(() => countCarriedChips(state.termites), [state.termites]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const sanitizedControls = clampControls(controls);
    const { intervalMs, stepsPerFrame } = buildScheduler(sanitizedControls.speed);

    const timer = window.setInterval(() => {
      setState((currentState) => {
        const batch = advanceSimulationBatch(currentState, stepsPerFrame);

        setThroughput((currentThroughput) => ({
          pickups: currentThroughput.pickups + batch.throughputDelta.pickups,
          drops: currentThroughput.drops + batch.throughputDelta.drops,
        }));

        setClusterMetrics((current) => ({
          largestPileShare: batch.nextClusterMetrics.largestPileShare,
          pileCount: batch.nextClusterMetrics.pileCount,
          trend: Number(formatFloat(batch.nextClusterMetrics.largestPileShare - current.largestPileShare)),
        }));

        return batch.nextState;
      });
    }, intervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [
    isRunning,
    controls.speed,
  ]);

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d') ?? null;
    drawWorld(context, state);
  }, [state]);

  const trendLabel =
    clusterMetrics.trend > 0.01
      ? `+${formatFloat(clusterMetrics.trend)}`
      : clusterMetrics.trend < -0.01
        ? formatFloat(clusterMetrics.trend)
        : '+0.00';

  function updateControl<K extends keyof SimulationControls>(key: K, rawValue: number): void {
    setControls((prev) => {
      const next = { ...prev, [key]: rawValue } as SimulationControls;
      return clampControls(next);
    });
  }

  function restartSimulation(nextControls: SimulationControls, includePopulation: boolean): void {
    const sanitizedControls = clampControls(nextControls);
    setControls(sanitizedControls);
    setIsRunning(true);
    setThroughput(DEFAULT_THROUGHPUT);
    setClusterMetrics(EMPTY_CLUSTER_METRICS);
    setState(createSimulationStateFromControls(sanitizedControls, includePopulation));
  }

  function handleCountChange(key: 'termiteCount' | 'woodchipCount', rawValue: number): void {
    const nextControls = clampControls({ ...controls, [key]: rawValue } as SimulationControls);
    restartSimulation(nextControls, true);
  }

  function handleReset(): void {
    const sanitizedControls = clampControls(controls);
    restartSimulation(sanitizedControls, false);
  }

  function handleRegenerate(): void {
    const sanitizedControls = clampControls(controls);
    restartSimulation(sanitizedControls, true);
  }

  function handleTogglePlayback(): void {
    setIsRunning((running) => !running);
  }

  function handleFastForward(): void {
    setState((currentState) => {
      const batch = advanceSimulationBatch(currentState, FAST_FORWARD_STEPS);
      setThroughput((currentThroughput) => ({
        pickups: currentThroughput.pickups + batch.throughputDelta.pickups,
        drops: currentThroughput.drops + batch.throughputDelta.drops,
      }));
      setClusterMetrics((current) => ({
        largestPileShare: batch.nextClusterMetrics.largestPileShare,
        pileCount: batch.nextClusterMetrics.pileCount,
        trend: Number(formatFloat(batch.nextClusterMetrics.largestPileShare - current.largestPileShare)),
      }));
      return batch.nextState;
    });
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Emergent Intelligence Sandbox</p>
        <h1>Termites and Woodchips</h1>
        <p className="intro">
          Random wandering, chip pickup on contact, and local drop rules based on the classic termite model.
        </p>
      </header>

      <section className="world-frame">
        <canvas
          ref={canvasRef}
          aria-label="World canvas"
          width={WORLD_WIDTH}
          height={WORLD_HEIGHT}
          data-testid="sim-canvas"
        />
      </section>

      <ControlsPanel>
        <section className="metric-dashboard" aria-label="Simulation metrics">
          {[
            {
              label: DASHBOARD_CARDS[0],
              value: String(state.termites.length),
            },
            {
              label: DASHBOARD_CARDS[1],
              value: String(visibleWoodchips),
            },
            {
              label: DASHBOARD_CARDS[2],
              value: String(carriedChips),
            },
            {
              label: DASHBOARD_CARDS[3],
              value: String(throughput.pickups),
            },
            {
              label: DASHBOARD_CARDS[4],
              value: String(throughput.drops),
            },
            {
              label: DASHBOARD_CARDS[5],
              value: String(state.tick),
            },
          ].map((card) => (
            <article key={card.label} className="metric-card">
              <p className="metric-label">{card.label}</p>
              <p className="metric-value">{card.value}</p>
            </article>
          ))}
          <article className="metric-card metric-card--cluster">
            <p className="metric-label">Largest pile share</p>
            <p className="metric-value">
              {formatFloat(clusterMetrics.largestPileShare)}%
              <span className="trend-indicator" aria-live="polite">
                {' '}
                ({trendLabel})
              </span>
            </p>
            <p className="metric-label">Estimated piles: {clusterMetrics.pileCount}</p>
          </article>
        </section>

        <div className="control-grid">
          <label>
            Termites: {controls.termiteCount}
            <input
              type="range"
              min={1}
              max={500}
              step={1}
              value={controls.termiteCount}
              onChange={(event) => handleCountChange('termiteCount', Number(event.target.value))}
              data-testid="control-termites"
            />
          </label>
          <label>
            Woodchips: {controls.woodchipCount}
            <input
              type="range"
              min={0}
              max={1000}
              step={1}
              value={controls.woodchipCount}
              onChange={(event) => handleCountChange('woodchipCount', Number(event.target.value))}
              data-testid="control-woodchips"
            />
          </label>
          <label>
            Speed (steps/s): {controls.speed}
            <input
              type="range"
              min={1}
              max={MAX_SPEED}
              step={1}
              value={controls.speed}
              onChange={(event) => updateControl('speed', Number(event.target.value))}
              data-testid="control-speed"
            />
          </label>
          <div className="control-actions">
            <button type="button" onClick={handleReset} data-testid="control-reset">
              Reset
            </button>
            <button type="button" onClick={handleRegenerate} data-testid="control-regenerate">
              Regenerate
            </button>
            <button type="button" onClick={handleFastForward} data-testid="control-fast-forward">
              Fast-forward
            </button>
            <button type="button" onClick={handleTogglePlayback} data-testid="control-playback">
              {isRunning ? 'Pause' : 'Resume'}
            </button>
          </div>
        </div>
        <p className="metric-row" data-testid="tick-metric">
          Tick {state.tick} | termites {state.termites.length} | chips {visibleWoodchips} | carried chips {carriedChips} | pickups{' '}
          {throughput.pickups} | drops {throughput.drops} | largest pile {formatFloat(clusterMetrics.largestPileShare)}% | piles{' '}
          {clusterMetrics.pileCount} ({trendLabel})
        </p>
      </ControlsPanel>
    </main>
  );
}
