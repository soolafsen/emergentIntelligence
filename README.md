# Termites and Woodchips

Browser-native emergent behavior sandbox built from the `emergent-intelligence-sandbox-notes` idea set.

The first slice focuses on one question: what kind of apparent coordination appears when very simple termites only use local sensing, pickup/drop bias, and lightweight signal traces?

## Quick start

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/` or the local Vite URL shown in the terminal.

## What is in this version

- Local-only termite sensing with no global map or path planning
- Woodchip pickup, carrying, and cluster-biased dropping
- Signal traces that bias later movement
- Live controls for termite count, woodchip count, speed, perception radius, pickup bias, and drop bias
- Pause, reset, and regenerate controls
- Lightweight metrics for pickups, drops, carried chips, elapsed ticks, and cluster density

## Verification

```bash
npm run build
npm run test
```

## Notes

- Implementation assumptions and Pi harness notes: [docs/assumptions-and-notes.md](docs/assumptions-and-notes.md)
