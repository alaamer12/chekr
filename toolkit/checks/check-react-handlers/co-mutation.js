/**
 * co-mutation.js
 *
 * Sub-Algorithm 3: Co-Mutation Cluster Detection
 *
 * Detects whether a handler manages a GROUP of state setters that are
 * semantically coupled — meaning they represent multiple facets of ONE
 * async operation's lifecycle, not just coincidentally adjacent writes.
 *
 * The canonical pattern is the loading/error/result triad:
 *
 *   setLoading(true)              ← BEFORE the async call (start phase)
 *   try {
 *     const data = await fetch()
 *     setData(data)               ← SUCCESS path
 *     setError(null)
 *     setLoading(false)
 *   } catch (e) {
 *     setError(e)                 ← ERROR path
 *     setLoading(false)
 *   }
 *
 * This is fundamentally different from "coincidental co-mutation":
 *
 *   setModalOpen(true)            ← unrelated concerns
 *   setSelectedItem(item)
 *   setLastInteractionTime(now)
 *
 * Detection model:
 *
 *   Phase 1 — Extract setter groups per try/catch phase
 *     For each try/catch block, collect setters in:
 *       (a) the lines BEFORE the try  (start phase)
 *       (b) the try body              (success phase)
 *       (c) the catch body            (error phase)
 *       (d) the finally body          (teardown phase)
 *
 *   Phase 2 — Score each group for lifecycle triad signals
 *     Strong signals (each scores 2):
 *       - A setter called with `true` or `false` (boolean toggle — loading flag)
 *       - A setter called with `null` (clearing error/data)
 *       - A setter called with an awaited result variable (setting result)
 *     Weak signals (each scores 1):
 *       - The SAME setter appears in multiple phases (coupled across phases)
 *       - 3+ distinct setters in one try/catch structure
 *
 *   Phase 3 — Verdict
 *     Score >= CLUSTER_IDENTITY_THRESHOLD → HAS IDENTITY → promotes to hook
 *     Score <  threshold → incidental co-mutation → stays in component
 */

// ─── Thresholds ───────────────────────────────────────────────────────────────
const CLUSTER_IDENTITY_THRESHOLD = 3   // score needed to call it a real cluster
const MIN_SETTERS_IN_GROUP = 2          // need at least 2 distinct setters

// ─── Regex ────────────────────────────────────────────────────────────────────

// Matches:  setFoo(  setSomeState(  etc.
// Captures the setter name and its argument list
const SETTER_CALL_RE = /\b(set[A-Z]\w*)\s*\(([^)]*)\)/g

// Boolean argument
const BOOL_ARG_RE = /^\s*(true|false)\s*$/

// Null argument
const NULL_ARG_RE = /^\s*null\s*$/

// Argument that looks like a variable (not a literal)
// i.e. not a string, number, boolean, null, or inline expression
const VAR_ARG_RE = /^\s*[a-z_$][a-zA-Z0-9_$.]*\s*$/

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract all setter calls from a list of lines.
 * Returns: SetterCall[]  { name, arg, line }
 */
function extractSetterCalls(lines, lineOffset = 0) {
  const calls = []
  for (let i = 0; i < lines.length; i++) {
    const re = new RegExp(SETTER_CALL_RE.source, 'g')
    let m
    while ((m = re.exec(lines[i])) !== null) {
      calls.push({
        name: m[1],
        arg: m[2].trim(),
        line: lineOffset + i,
      })
    }
  }
  return calls
}

// String literal argument (quoted)
const STRING_LITERAL_RE = /^\s*['"`].*['"`]\s*$/

// Number literal
const NUMBER_LITERAL_RE = /^\s*-?\d[\d.]*\s*$/

/**
 * Classify what kind of argument a setter is called with.
 * Returns: 'boolean' | 'null' | 'variable' | 'literal' | 'expression'
 */
function classifyArg(arg) {
  if (BOOL_ARG_RE.test(arg))        return 'boolean'
  if (NULL_ARG_RE.test(arg))        return 'null'
  if (STRING_LITERAL_RE.test(arg))  return 'literal'
  if (NUMBER_LITERAL_RE.test(arg))  return 'literal'
  if (VAR_ARG_RE.test(arg))         return 'variable'
  return 'expression'
}

/**
 * Score a group of setter calls for lifecycle triad identity.
 * Higher score = more likely to be a semantically coupled cluster.
 *
 * A REAL cluster needs: boolean toggle + (null clear OR variable result).
 * String/number literals do NOT count as a result-set signal.
 */
function scoreGroup(setterCalls) {
  if (setterCalls.length < MIN_SETTERS_IN_GROUP) return { score: 0, signals: [] }

  const signals = []
  let score = 0

  const argTypes = setterCalls.map(c => classifyArg(c.arg))
  const setterNames = new Set(setterCalls.map(c => c.name))

  const hasBooleanToggle = argTypes.includes('boolean')
  const hasNullClear     = argTypes.includes('null')
  // Only real variables or computed expressions count — not string/number literals
  const hasResultSet     = argTypes.includes('variable') || argTypes.includes('expression')

  // Strong signal: boolean toggle setter present (loading flag pattern)
  if (hasBooleanToggle) {
    score += 2
    signals.push('boolean-toggle (loading flag)')
  }

  // Strong signal: null-clearing setter present (error/data clear pattern)
  if (hasNullClear) {
    score += 2
    signals.push('null-clear (error/data reset)')
  }

  // Strong signal: variable/expression result setter present
  // BUT only if we also have a boolean toggle or null clear —
  // a lone variable-result setter is not enough to call it a cluster
  if (hasResultSet && (hasBooleanToggle || hasNullClear)) {
    score += 2
    signals.push('variable-result (async result assignment)')
  }

  // Weak signal: 3+ distinct setters
  if (setterNames.size >= 3) {
    score += 1
    signals.push(`${setterNames.size} distinct setters`)
  }

  return { score, signals, setterNames: [...setterNames] }
}

// ─── Main detector ────────────────────────────────────────────────────────────

/**
 * Detect co-mutation clusters in a handler body.
 *
 * @param {string[]} bodyLines
 * @param {DataFlowGraph} graph  — used for try/catch block structure
 * @returns {CoMutationResult}
 */
export function detectCoMutationCluster(bodyLines, graph) {
  const { tryCatchBlocks } = graph

  if (tryCatchBlocks.length === 0) {
    // No try/catch — check for coincidental co-mutation in flat body
    const allSetters = extractSetterCalls(bodyLines)
    const flatResult = scoreGroup(allSetters)

    return {
      hasCluster: false,   // flat body without try/catch never promotes
      clusters: [],
      incidentalCoMutation: allSetters.length >= MIN_SETTERS_IN_GROUP,
      incidentalSetters: [...new Set(allSetters.map(c => c.name))],
    }
  }

  const clusters = []

  for (const block of tryCatchBlocks) {
    const { tryLines, catchLines, finallyLines } = block

    // Collect setters by phase
    const trySetters     = extractSetterCalls(tryLines)
    const catchSetters   = extractSetterCalls(catchLines)
    const finallySetters = extractSetterCalls(finallyLines)

    // Find lines BEFORE this try block — "start phase" setters
    // Approximation: look at up to 5 lines before the try for setter calls
    // (in practice the try block IS inside the handler body, so we look
    //  at all body lines before the first try line)
    const tryStartLine = bodyLines.findIndex(l => /\btry\s*\{/.test(l))
    const beforeLines = tryStartLine > 0 ? bodyLines.slice(0, tryStartLine) : []
    const beforeSetters = extractSetterCalls(beforeLines)

    // --- Cross-phase coupling check ---
    // The strongest signal: the SAME setter name appears in multiple phases.
    // e.g. setLoading appears in before-try AND catch AND finally
    const allPhaseSetterNames = [
      ...beforeSetters,
      ...trySetters,
      ...catchSetters,
      ...finallySetters,
    ].map(c => c.name)

    const setterFrequency = new Map()
    for (const name of allPhaseSetterNames) {
      setterFrequency.set(name, (setterFrequency.get(name) ?? 0) + 1)
    }

    const crossPhaseSetters = [...setterFrequency.entries()]
      .filter(([, count]) => count >= 2)
      .map(([name]) => name)

    // --- Score each phase group ---
    // The try-body setters are the primary group
    const allBlockSetters = [...trySetters, ...catchSetters, ...finallySetters]
    const { score, signals, setterNames } = scoreGroup(allBlockSetters)

    // Bonus for cross-phase coupling (same setter in multiple phases)
    let finalScore = score
    const crossPhaseSignals = []
    if (crossPhaseSetters.length >= 1) {
      finalScore += crossPhaseSetters.length
      crossPhaseSignals.push(
        `${crossPhaseSetters.length} setter(s) appear across multiple phases: ${crossPhaseSetters.join(', ')}`
      )
    }

    // Also score the before-try setters together with try setters
    const fullGroup = [...beforeSetters, ...trySetters]
    const { score: fullScore } = scoreGroup(fullGroup)
    if (fullScore > finalScore) finalScore = fullScore

    // Gate: need at least MIN_SETTERS_IN_GROUP distinct setter NAMES across
    // the whole block before any cluster can be declared.
    const allDistinctNames = new Set(allBlockSetters.map(c => c.name))
    if (allDistinctNames.size < MIN_SETTERS_IN_GROUP) continue

    if (finalScore >= CLUSTER_IDENTITY_THRESHOLD) {
      clusters.push({
        setterNames: setterNames ?? [...new Set(allBlockSetters.map(c => c.name))],
        score: finalScore,
        signals: [...signals, ...crossPhaseSignals],
        phases: {
          before:  beforeSetters.map(c => c.name),
          try:     trySetters.map(c => c.name),
          catch:   catchSetters.map(c => c.name),
          finally: finallySetters.map(c => c.name),
        },
        crossPhaseSetters,
        hasTryCatch:   block.hasCatch,
        hasFinally:    block.hasFinally,
      })
    }
  }

  return {
    hasCluster: clusters.length > 0,
    clusters,
    incidentalCoMutation: false,
    incidentalSetters: [],
  }
}
