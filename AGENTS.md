# Agent Instructions

Preferences for AI agents working in this repository. Follow these on every task, including when delegating to subagents.

---

## Mandatory skill usage

**Applies to:** main agent, subagents, delegated tasks — any work that changes code, runs audits, or executes a workflow.

**Does NOT apply to:** pure questions, explanations, or **Ask mode** (read-only).

Before starting work:

1. **Use at least ONE skill** from [`.cursor/skills/`](.cursor/skills/).
2. **Read that skill's `SKILL.md` in full** — follow its workflow, not memory.
3. **If unsure which skill fits** → read [`.cursor/skills/using-agent-skills/SKILL.md`](.cursor/skills/using-agent-skills/SKILL.md) first, pick from the catalog, then read the chosen skill.
4. **State which skill(s) you used** when reporting results.

Full catalog: `.cursor/skills/using-agent-skills/SKILL.md`

---

## Shell & commands

- **Prefer CMD over PowerShell.** PowerShell commands often hang or behave poorly in this environment. Use `cmd /c "..."` for simple one-off commands when needed.
- **Prefer one command at a time.** Do not chain with `&&`, `||`, or pipes unless unavoidable.
- **Complex or multi-step commands:** write a script under [`scratch/`](scratch/), run it, then **delete it when finished**.
- **Package manager:** always use **bun** and **bunx** (not npm, npx, or yarn) unless there is a strong reason not to.

---

## Debugging

- **Try multiple approaches.** If the code looks correct, do not stop at one failed attempt.
- **Escalate systematically:**
  1. Write a **debug SQL file** in `scratch/` and query the database directly to confirm data exists.
  2. If the DB returns expected data, write a **debug script** that calls the existing **service layer** to see if the bug is in the service (hotspot) vs UI/routing.
  3. Keep **hypothesizing and narrowing** until the root cause is found.
- **Scratch debug files:** read configuration via **`process.env`** (never hardcode secrets or connection strings).
- **Clean up:** remove scratch debug files when done.

---

## up-agents (staggered workers + reviewer)

When the user says **`up-agents`**, **`up-agents 4 + 1`**, or **`/up-agents`**, read **`.cursor/skills/up-agents/SKILL.md`** in full and follow it — do not ask them to re-explain.

| User says | Meaning |
|-----------|---------|
| `up-agents` | 4 workers + 1 reviewer (defaults: stagger 60s, reviewer @800s) |
| `up-agents 4 + 1` | 4 workers + 1 reviewer (explicit) |
| `up-agents 3 + 1 @600` | 3 workers + reviewer wakes at 600s |
| `/up-agents 4 + 1 {task}` | Same via slash command (see `.cursor/commands/up-agents.md`) |

Launch all **N+1** subagents in one message. Workers sleep before work; reviewer runs last. Chekr scope split: `.cursor/skills/up-agents/reference.md`.

---

## Agent pool notation (fan-out delegation)

When the user says **"pool of agents"** or uses notation like **`x->2x->4x`**, run a branching delegation tree — do not ask them to re-explain.

### Shorthand

| User says | Meaning |
|-----------|---------|
| `pool of agents x->2x->4x` | 2 parallel subagents; each spawns 2 more (= 4 leaves) |
| `pool of agents x->3x` | 3 parallel subagents, no further fan-out |
| `pool of agents x->2x->4x->8x` | 2 → 4 → 8 over three worker depths |
| `/pool-agents x->2x->4x {task}` | Same as above via slash command (see `.cursor/commands/pool-agents.md`) |

### Grammar

`x->N1x->N2x->...` — token after `->` is the **agent count at that depth**:

- `x` = you (orchestrator; merge results, do not do all leaf work yourself)
- `2x` = 2 agents at depth 1
- `4x` = 4 agents at depth 2 (each depth-1 agent spawned 2 children)

Branching factor = `count[n+1] / count[n]`. Max **4 worker depths**. Never infinite.

### How to execute

1. Parse notation + task
2. Split task into scoped subtasks (one per leaf)
3. Launch depth-1 subagents **in parallel** (multiple Task calls in one message)
4. Each subagent that has a deeper level MUST spawn its children in parallel and merge before returning
5. Root merges all branch results into one response

Full algorithm: [`.cursor/commands/pool-agents.md`](.cursor/commands/pool-agents.md)

---

## Subagent delegation

When spawning a subagent (Task tool or any delegated work), **paste the block below as the first thing in the prompt** so the subagent inherits these rules.

```
=== MANDATORY AGENT PREFERENCES (read and follow) ===

1. SKILLS — Use at least ONE skill from .cursor/skills/ (read its SKILL.md in full). Unsure? Start with .cursor/skills/using-agent-skills/SKILL.md. Not required for pure questions / Ask mode.

2. SHELL — Prefer CMD over PowerShell (PowerShell hangs). One command at a time; no && or || chaining unless unavoidable. Complex/pipelined commands → script in scratch/, delete when done.

3. TOOLING — Use bun and bunx (not npm/npx/yarn).

4. DEBUG — Try multiple approaches. If code looks correct: debug SQL in scratch/ → test via existing services → hypothesize until root cause. Use process.env in scratch debug files. Delete scratch files when finished.

=== END PREFERENCES — task follows below ===
```
