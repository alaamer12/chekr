/**
 * state-machine.js
 *
 * Sub-Algorithm 4: State Machine vs. Branching Mutator Detection
 *
 * The question: does this handler describe STATE TRANSITIONS of a single
 * conceptual machine, or does it just react to different conditions by
 * writing to unrelated state?
 *
 * State machine (must become hook):
 *
 *   if (uploadStatus === 'idle') {
 *     setProgress(0); setFile(null)           ← same setters as other arms
 *   } else if (uploadStatus === 'uploading') {
 *     setProgress(pct); setCancelToken(token) ← same setters as other arms
 *   } else if (uploadStatus === 'done') {
 *     setResult(data); setProgress(100)       ← same setters as other arms
 *   }
 *
 * Branching mutator (valid, stays in component):
 *
 *   if (items.length === 0) setEmpty(true)     ← different setters per arm
 *   else if (items.length === 1) setSingular(true)
 *   else if (items.length < 10) setFew(true)
 *   else setMany(true)
 *
 * Detection model:
 *
 *   Phase 1 — Find the "pivot variable"
 *     The variable all branches switch on. Detected by finding:
 *       - switch(x) { ... }
 *       - if (x === 'a') ... else if (x === 'b') ...
 *     where x appears in EVERY branch condition.
 *
 *   Phase 2 — Collect per-arm setter sets
 *     For each branch arm, collect which setters it calls.
 *
 *   Phase 3 — Measure setter OVERLAP across arms
 *     Jaccard intersection over all arm setter sets.
 *     High overlap (>= OVERLAP_THRESHOLD) = state machine
 *     Low overlap = branching mutator (arms write independent state)
 *
 *   Phase 4 — Verdict
 *     State machine: pivot exists AND overlap >= threshold AND arms >= MIN_ARMS
 *     Branching mutator: everything else
 */

// ─── Thresholds ───────────────────────────────────────────────────────────────
const OVERLAP_THRESHOLD = 0.4    // >= 40% setter overlap → state machine signal
const MIN_ARMS          = 2      // minimum branch arms to analyze
const MACHINE_ARM_MIN   = 3      // arms >= this → definite state machine territory

// ─── Regex ────────────────────────────────────────────────────────────────────

// switch (someVar) {
const SWITCH_RE = /\bswitch\s*\(\s*(\w[\w.]*)\s*\)/

// case 'value':  or  case SomeEnum.VALUE:
const CASE_RE = /^\s*case\s+(.+?)\s*:/

// default:
const DEFAULT_RE = /^\s*default\s*:/

// if (x === 'val') or if (x == 'val') or if (x === SomeEnum.X)
// Captures the variable being tested
const IF_EQUALITY_RE = /\bif\s*\(\s*(\w[\w.]*)\s*===?\s*['"A-Z_]|\bif\s*\(\s*['"A-Z_][^)]*===?\s*(\w[\w.]*)/

// else if (x === 'val')
const ELSE_IF_RE = /\belse\s+if\s*\(/

// Setter call: setFoo(
const SETTER_RE = /\b(set[A-Z]\w*)\s*\(/g

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract all setter names called within a block of lines.
 */
function settersInLines(lines) {
  const names = new Set()
  for (const line of lines) {
    const re = new RegExp(SETTER_RE.source, 'g')
    let m
    while ((m = re.exec(line)) !== null) names.add(m[1])
  }
  return names
}

/**
 * Jaccard similarity between two sets.
 */
function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1
  const intersection = [...setA].filter(x => setB.has(x)).length
  const union = new Set([...setA, ...setB]).size
  return intersection / union
}

/**
 * Average pairwise Jaccard across all arm pairs.
 */
function averagePairwiseOverlap(armSetterSets) {
  if (armSetterSets.length < 2) return 0
  let total = 0
  let count = 0
  for (let i = 0; i < armSetterSets.length; i++) {
    for (let j = i + 1; j < armSetterSets.length; j++) {
      total += jaccardSimilarity(armSetterSets[i], armSetterSets[j])
      count++
    }
  }
  return total / count
}

// ─── Switch-based state machine ───────────────────────────────────────────────

/**
 * Extract arms from a switch block using brace-depth tracking.
 * Returns: SwitchArm[] { label, lines }
 */
function extractSwitchArms(bodyLines, switchLineIdx) {
  const arms = []
  let currentLabel = null
  let currentLines = []
  let depth = 0
  let inSwitch = false

  for (let i = switchLineIdx; i < bodyLines.length; i++) {
    const line = bodyLines[i]

    for (const ch of line) {
      if (ch === '{') depth++
      if (ch === '}') depth--
    }

    if (!inSwitch) {
      if (depth >= 1) inSwitch = true
      continue
    }

    // At switch body depth (depth == 1), look for case/default labels
    if (depth === 1) {
      const caseMatch = CASE_RE.exec(line)
      const isDefault = DEFAULT_RE.test(line)

      if (caseMatch || isDefault) {
        if (currentLabel !== null) {
          arms.push({ label: currentLabel, lines: currentLines })
        }
        currentLabel = isDefault ? 'default' : caseMatch[1]
        // Include the case line itself — it may contain inline statements
        // e.g. `case 'x': setFoo(1); break`
        currentLines = [line]
        continue
      }
    }

    if (depth <= 0) {
      if (currentLabel !== null) {
        arms.push({ label: currentLabel, lines: currentLines })
      }
      break
    }

    if (currentLabel !== null) currentLines.push(line)
  }

  return arms
}

/**
 * Analyze a switch statement for state machine signals.
 */
function analyzeSwitchStatement(bodyLines) {
  const switchLineIdx = bodyLines.findIndex(l => SWITCH_RE.test(l))
  if (switchLineIdx === -1) return null

  const pivotVar = SWITCH_RE.exec(bodyLines[switchLineIdx])?.[1] ?? null
  if (!pivotVar) return null

  const arms = extractSwitchArms(bodyLines, switchLineIdx)
  if (arms.length < MIN_ARMS) return null

  const armSetterSets = arms.map(arm => settersInLines(arm.lines))
  const overlap = averagePairwiseOverlap(armSetterSets)
  const totalSetters = new Set(armSetterSets.flatMap(s => [...s]))

  return {
    kind: 'switch',
    pivotVar,
    armCount: arms.length,
    armLabels: arms.map(a => a.label),
    armSetterSets,
    setterOverlap: overlap,
    totalDistinctSetters: totalSetters.size,
    isStateMachine: overlap >= OVERLAP_THRESHOLD || arms.length >= MACHINE_ARM_MIN,
  }
}

// ─── If/else-based state machine ─────────────────────────────────────────────

/**
 * Extract the pivot variable from an if/else chain.
 * Returns the variable name if all conditions test the same variable, else null.
 */
function extractIfElsePivot(bodyLines) {
  const conditions = []

  for (const line of bodyLines) {
    const m = IF_EQUALITY_RE.exec(line)
    if (m) {
      conditions.push(m[1] ?? m[2])
    }
  }

  if (conditions.length < MIN_ARMS) return null

  // All conditions must test the same variable
  const unique = new Set(conditions)
  if (unique.size === 1) return conditions[0]

  // Allow one "other" variable (can happen with guard patterns)
  // but the dominant variable must appear in >= 2/3 of conditions
  for (const candidate of unique) {
    const freq = conditions.filter(c => c === candidate).length
    if (freq / conditions.length >= 0.66) return candidate
  }

  return null
}

/**
 * Extract if/else arms from the body.
 *
 * Strategy: scan once looking for if/else if/else boundaries by tracking
 * brace depth. When depth returns to 0 inside a `} else` sequence, we've
 * found an arm boundary — not the end of the whole chain.
 *
 * Returns arms with their label and body lines.
 */
function extractIfElseArms(bodyLines) {
  // Find the first `if (` that starts a chain
  const firstIfIdx = bodyLines.findIndex(l => /^\s*if\s*\(/.test(l))
  if (firstIfIdx === -1) return []

  const arms = []
  let currentLabel = IF_EQUALITY_RE.exec(bodyLines[firstIfIdx])?.[1] ?? 'if'
  let currentLines = []
  let depth = 0
  let started = false

  for (let i = firstIfIdx; i < bodyLines.length; i++) {
    const line = bodyLines[i]

    // Detect arm boundary: "} else if" or "} else {" at depth 0 (after the } closes prior arm)
    // We detect this BEFORE counting braces for this line
    if (started && depth === 1) {
      const isElseIf   = /^\s*\}\s*else\s+if\s*\(/.test(line)
      const isElseOnly = /^\s*\}\s*else\s*\{/.test(line) && !/\bif\b/.test(line.replace(/^\s*\}/, '').split('else')[0])

      if (isElseIf || isElseOnly) {
        // Save current arm
        arms.push({ label: currentLabel, lines: currentLines })
        // Start new arm — the } on this line closes the previous arm
        currentLabel = isElseOnly
          ? 'else'
          : (IF_EQUALITY_RE.exec(line)?.[1] ?? 'else-if')
        currentLines = []
        // Don't count the leading } as closing the whole chain —
        // recalculate depth for this line treating } and { normally
        for (const ch of line) {
          if (ch === '{') { depth++; started = true }
          if (ch === '}') depth--
        }
        continue
      }
    }

    // Count braces
    for (const ch of line) {
      if (ch === '{') { depth++; started = true }
      if (ch === '}') depth--
    }

    currentLines.push(line)

    // If depth hit 0 and we're NOT in a "} else" continuation, the chain is done
    if (started && depth <= 0) {
      arms.push({ label: currentLabel, lines: currentLines })
      break
    }
  }

  return arms
}

/**
 * Analyze an if/else chain for state machine signals.
 */
function analyzeIfElseChain(bodyLines) {
  const pivotVar = extractIfElsePivot(bodyLines)
  // Even without a clear pivot, check if the arm structure looks like a machine
  // (many arms, high setter overlap)

  const arms = extractIfElseArms(bodyLines)
  if (arms.length < MIN_ARMS) return null

  const armSetterSets = arms.map(arm => settersInLines(arm.lines))
  const overlap = averagePairwiseOverlap(armSetterSets)
  const totalSetters = new Set(armSetterSets.flatMap(s => [...s]))

  // Determine if this is a state machine:
  //   - Has a clear pivot variable, OR
  //   - Has 3+ arms with high setter overlap
  const isStateMachine = (
    (pivotVar !== null && overlap >= OVERLAP_THRESHOLD) ||
    (arms.length >= MACHINE_ARM_MIN && overlap >= OVERLAP_THRESHOLD) ||
    (pivotVar !== null && arms.length >= MACHINE_ARM_MIN)
  )

  return {
    kind: 'if-else',
    pivotVar,
    armCount: arms.length,
    armLabels: arms.map(a => a.label),
    armSetterSets,
    setterOverlap: overlap,
    totalDistinctSetters: totalSetters.size,
    isStateMachine,
  }
}

// ─── Main detector ────────────────────────────────────────────────────────────

/**
 * Detect state machine patterns in a handler body.
 *
 * @param {string[]} bodyLines
 * @returns {StateMachineResult}
 */
export function detectStateMachine(bodyLines) {
  // Try switch analysis first (clearest signal)
  const switchResult = analyzeSwitchStatement(bodyLines)
  if (switchResult?.isStateMachine) {
    return {
      isStateMachine: true,
      isBranchingMutator: false,
      kind: 'switch',
      pivotVar: switchResult.pivotVar,
      armCount: switchResult.armCount,
      setterOverlap: switchResult.setterOverlap,
      totalDistinctSetters: switchResult.totalDistinctSetters,
      detail: switchResult,
    }
  }

  // Try if/else analysis
  const ifElseResult = analyzeIfElseChain(bodyLines)
  if (ifElseResult?.isStateMachine) {
    return {
      isStateMachine: true,
      isBranchingMutator: false,
      kind: 'if-else',
      pivotVar: ifElseResult.pivotVar,
      armCount: ifElseResult.armCount,
      setterOverlap: ifElseResult.setterOverlap,
      totalDistinctSetters: ifElseResult.totalDistinctSetters,
      detail: ifElseResult,
    }
  }

  // If we have branching but it's not a state machine, it's a branching mutator
  const hasBranching = bodyLines.some(l => /\bif\s*\(|\bswitch\s*\(/.test(l))
  const hasSetters   = bodyLines.some(l => /\bset[A-Z]/.test(l))

  return {
    isStateMachine: false,
    isBranchingMutator: hasBranching && hasSetters,
    kind: null,
    pivotVar: null,
    armCount: switchResult?.armCount ?? ifElseResult?.armCount ?? 0,
    setterOverlap: switchResult?.setterOverlap ?? ifElseResult?.setterOverlap ?? 0,
    totalDistinctSetters: 0,
    detail: switchResult ?? ifElseResult ?? null,
  }
}
