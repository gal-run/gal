# Credits & Acknowledgments

`@gal/swarm` is original work by Scheduler Systems Ltd, but it builds on and
conforms to open work. We gratefully acknowledge:

## Prompt-to-Binary Standard

`@gal/swarm` adopts and conforms to the **Prompt-to-Binary** standard for
artifact generation and verification gates.

- Project: GravitonChips / `prompt-to-binary`
- Repository: https://github.com/GravitonChips/prompt-to-binary

`@gal/swarm` is a *consumer* of the standard; it does not vendor or fork its code.
See `docs/adr/0001-swarm-standard-adoption.md` and `docs/standard/architecture.md`.

## Swarms — orchestration topology vocabulary

The orchestration-mode vocabulary (e.g. SequentialWorkflow, HierarchicalSwarm,
MixtureOfAgents, GroupChat, ForestSwarm, HeavySwarm) is **inspired by** the public
**Swarms** agent-framework taxonomy. `@gal/swarm` accepts these names as input
*aliases* and normalizes them into GAL-native primitives — it does **not** run,
import, or depend on the Swarms runtime. No Swarms code is included.

See `src/application/topology-aliases.ts` and `docs/concepts/governed-coding-swarm.md`.

---

If we have missed an attribution, please open an issue — we want to credit
upstream work correctly.
