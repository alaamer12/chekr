# checkr/prompts/

AI prompts for building checkr. Three prompts, three steps, one pipeline.

## The Pipeline

```
SPEC_PROMPT.md  →  PLAN_PROMPT.md  →  IMPL_PROMPT.md
     ↓                   ↓                  ↓
  SPEC.md             PLAN.md         checklist.md
                                      progress_1.md
                                      (implementation)
```

Each step is a separate AI session. Each step requires the previous step's output.

---

## Step 1 — Spec

**Prompt:** `SPEC_PROMPT.md`  
**Send alongside:** All docs in `checkr/` (README, REQUIREMENTS, ARCHITECTURE, DECISIONS, RULE_AUTHORING, CONFIG, CLI, ROADMAP)  
**Produces:** `output/SPEC.md`  
**Scope:** v1.0–v1.6 only. Nothing from FUTURE.md.

The spec is the contract. Every implementation decision traces back to it.
Review it carefully before moving to the plan. Amendments are cheaper here
than after implementation starts.

---

## Step 2 — Plan

**Prompt:** `PLAN_PROMPT.md`  
**Send alongside:** `output/SPEC.md`, `checkr/ARCHITECTURE.md`, `checkr/ROADMAP.md`  
**Produces:** `output/PLAN.md`  
**Scope:** File-by-file, milestone-by-milestone. Soft code only — no implementations.

The plan is the execution order. Every file, every export, every dependency.
Review it for correctness before implementation starts. A wrong plan produces
wrong code — and the AI will follow the plan exactly.

---

## Step 3 — Implementation

**Prompt:** `IMPL_PROMPT.md`  
**Send alongside:** `output/SPEC.md`, `output/PLAN.md`  
**Produces:** `output/.checklist/checklist.md`, `output/.checklist/progress_1.md`, then the actual code  
**Scope:** One milestone at a time. User confirms before each milestone proceeds.

The implementation follows the checklist. The checklist follows the plan.
The plan follows the spec. The spec follows the docs.

---

## Files

| File | Purpose |
|------|---------|
| `SPEC_PROMPT.md` | Prompt for generating the full technical specification |
| `PLAN_PROMPT.md` | Prompt for generating the file-by-file implementation plan |
| `IMPL_PROMPT.md` | Prompt for creating the checklist and implementing milestone by milestone |
| `output/` | Where AI-generated artifacts land |
