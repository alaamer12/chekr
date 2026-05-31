# checkr/prompts/output/

This directory is where AI-generated artifacts land.

| File | Produced by | Status |
|------|-------------|--------|
| `SPEC.md` | SPEC_PROMPT.md | Not yet generated |
| `PLAN.md` | PLAN_PROMPT.md | Not yet generated |
| `.checklist/checklist.md` | IMPL_PROMPT.md | Not yet generated |
| `.checklist/progress_1.md` | IMPL_PROMPT.md | Not yet generated |

## Pipeline

```
1. Send SPEC_PROMPT.md to AI → produces SPEC.md
   Review SPEC.md. Request amendments if needed.

2. Send PLAN_PROMPT.md + SPEC.md to AI → produces PLAN.md
   Review PLAN.md. Request amendments if needed.

3. Send IMPL_PROMPT.md + SPEC.md + PLAN.md to AI → creates checklist, implements milestone by milestone
```

Each step is a separate session. Do not skip steps.
