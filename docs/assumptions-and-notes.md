# Emergent Sandbox Notes

## First-version assumptions

- The world is a bounded rectangle with hard edges, not a wrap-around torus.
- Termites have no shared global map, no path planner, and no durable world memory.
- Perception is purely local and radius-based for termites, woodchips, and signal traces.
- The current signal field is a lightweight local cue, not symbolic communication.
- Clustering is encouraged by pickup/drop bias and signal-following, not explicit goals.

## Default tuning

- Termites: `60`
- Woodchips: `160`
- Speed: `12` steps per second
- Perception radius: `70`
- Pickup bias: `0.35`
- Drop bias: `0.20`

These defaults were chosen to make clustering visible quickly without turning the canvas into unreadable overdraw.

## Current limitations

- This version focuses only on termites and woodchips, not boids or ant-trail variants.
- Cluster density is intentionally simple and local; it is meant for visual feedback, not research-grade measurement.
- Signals are rendered as lightweight sampled particles for performance and readability.
- Reset clears the active population while keeping the current control values; Regenerate creates a fresh population.

## Pi Harness Notes

- Pi worked for the actual build, but it created a few harness-specific problems that Codex did not create in the same way.
- `ralph install --skills` still assumes an interactive TTY, which breaks unattended setup flows.
- Pi PRD generation initially marked stories as `done` before implementation existed, so the PRD status had to be corrected.
- Pi completion detection needed to be tightened so echoed prompt text or log content could not be mistaken for assistant completion.
- Pi was more prone to chasing Ralph's own `.ralph/runs` files when the build prompt exposed those paths too prominently, so the prompt had to explicitly forbid that.
- On this machine, Pi reported itself through the `openai-codex` provider with model `gpt-5.3-codex-spark`, even though the harness entrypoint was `pi`.
