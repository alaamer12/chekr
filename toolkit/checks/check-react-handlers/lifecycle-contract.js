/**
 * lifecycle-contract.js
 *
 * Sub-Algorithm 1: Lifecycle Contract Detection
 *
 * Detects whether a handler owns a cleanup obligation — meaning it creates
 * a resource that must be torn down, and that teardown is wired into a
 * cleanup path (return function, finally block, or catch block).
 *
 * This works on the DataFlowGraph, NOT on raw regex against names.
 * It doesn't care if you called it `controller`, `ac`, `aborter`, or `handle`.
 *
 * The structural pattern it looks for:
 *
 *   PHASE 1 — Resource creation
 *     A variable is assigned via `new Something()` or a known
 *     subscription-style call (.subscribe(), addEventListener, setInterval, etc.)
 *
 *   PHASE 2 — Resource use
 *     That variable (or a property of it, like .signal) is referenced
 *     in the body AFTER creation — passed into another call.
 *
 *   PHASE 3 — Cleanup wiring
 *     That same variable is referenced again in a cleanup path:
 *       (a) a return () => { ... } function   (cleanup return)
 *       (b) a finally { ... } block
 *       (c) a .abort() / .cancel() / .unsubscribe() / .close() / .destroy() call
 *           that appears in finally OR in a returned cleanup function
 *
 * A handler has a lifecycle contract only if ALL THREE phases are present.
 */

// ─── Known resource-creation APIs ────────────────────────────────────────────
// These are classes / factory functions whose instances require explicit cleanup.
// We detect `new X(` where X matches one of these.
// This list is for INITIAL DETECTION of Phase 1 — not for naming the variable.
const RESOURCE_CONSTRUCTOR_RE =
  /\b(AbortController|EventEmitter|MutationObserver|IntersectionObserver|ResizeObserver|PerformanceObserver|WebSocket|EventSource|BroadcastChannel|Worker|SharedWorker|MediaRecorder)\b/

// Subscription-style factory calls (not `new`, but still create a handle):
//   observable.subscribe(...)
//   emitter.on(...)
//   target.addEventListener(...)
//   setInterval(...)  / setTimeout(...)
const SUBSCRIPTION_CALL_RE =
  /\b(subscribe|addListener|addEventListener|on(?=[A-Z(]))\s*\(/

const TIMER_CALL_RE =
  /\b(setInterval|setTimeout)\s*\(/

// ─── Known cleanup method names ───────────────────────────────────────────────
// We look for these called on a known resource variable.
// Not matched by name of the variable — matched by METHOD name on the variable.
const CLEANUP_METHOD_RE =
  /\.(abort|cancel|unsubscribe|close|destroy|disconnect|stop|remove|removeEventListener|removeListener|off)\s*\(/

// clearInterval / clearTimeout take the timer id as argument
const CLEAR_TIMER_RE =
  /\b(clearInterval|clearTimeout)\s*\((\w+)/

// ─── Cleanup path markers ─────────────────────────────────────────────────────
// A cleanup call only counts if it's inside one of these paths:
const RETURN_CLEANUP_RE = /^\s*return\s*\(\)\s*=>/
const FINALLY_OPEN_RE   = /\}\s*finally\s*\{/

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determine which lines are inside a cleanup path.
 * A cleanup path is:
 *   (a) inside a `return () => { ... }` block
 *   (b) inside a `finally { ... }` block
 *
 * Returns a Set of line indices that are inside a cleanup path.
 */
function findCleanupPathLines(bodyLines) {
  const cleanupLines = new Set()

  let i = 0
  while (i < bodyLines.length) {
    const line = bodyLines[i]

    // return () => { ... }  — cleanup return
    if (RETURN_CLEANUP_RE.test(line)) {
      let depth = 0
      let started = false
      for (let j = i; j < bodyLines.length; j++) {
        const l = bodyLines[j]
        for (const ch of l) {
          if (ch === '{') { depth++; started = true }
          if (ch === '}') depth--
        }
        cleanupLines.add(j)
        if (started && depth <= 0) break
      }
    }

    // finally { ... }
    // The `} finally {` line has net depth 0 — we must start counting AFTER
    // the opening { of the finally block, not from the finally line itself.
    if (FINALLY_OPEN_RE.test(line)) {
      // Find the opening { in the finally line, then collect lines until
      // the matching } that closes the finally block.
      // We track depth starting at 1 (we've already passed the {).
      let depth = 1
      cleanupLines.add(i)   // include the finally { line itself
      for (let j = i + 1; j < bodyLines.length; j++) {
        const l = bodyLines[j]
        for (const ch of l) {
          if (ch === '{') depth++
          if (ch === '}') depth--
        }
        cleanupLines.add(j)
        if (depth <= 0) break
      }
    }

    i++
  }

  return cleanupLines
}

/**
 * Detect resource handle variables from the symbol table.
 *
 * A "resource handle" is a variable that was created via:
 *   - new KnownResourceClass(...)
 *   - someObj.subscribe(...)  / addEventListener(...)  / setInterval(...) etc.
 *
 * Returns: ResourceHandle[]
 *   { varName, kind, creationLine }
 */
function detectResourceHandles(graph) {
  const handles = []

  for (const [name, sym] of graph.symbols) {
    if (!sym.rhs) continue

    // new SomeClass(...)
    if (sym.isNew && RESOURCE_CONSTRUCTOR_RE.test(sym.rhs)) {
      handles.push({ varName: name, kind: 'constructor', creationLine: sym.line })
      continue
    }

    // subscription-style calls
    if (SUBSCRIPTION_CALL_RE.test(sym.rhs)) {
      handles.push({ varName: name, kind: 'subscription', creationLine: sym.line })
      continue
    }

    // timer calls
    if (TIMER_CALL_RE.test(sym.rhs)) {
      handles.push({ varName: name, kind: 'timer', creationLine: sym.line })
      continue
    }
  }

  // Also detect destructured handles: const { signal } = new AbortController()
  // In this case the AbortController instance itself may not be named,
  // but the destructured property IS the handle we care about.
  for (const [name, sym] of graph.symbols) {
    if (!sym.destructuredFrom) continue
    if (RESOURCE_CONSTRUCTOR_RE.test(sym.destructuredFrom)) {
      handles.push({ varName: name, kind: 'destructured-constructor', creationLine: sym.line })
    }
  }

  return handles
}

// ─── Main detector ────────────────────────────────────────────────────────────

/**
 * Detect lifecycle contracts in a handler body.
 *
 * @param {string[]} bodyLines
 * @param {DataFlowGraph} graph
 * @returns {LifecycleContractResult}
 */
export function detectLifecycleContract(bodyLines, graph) {
  // Phase 1 — find resource handles
  const handles = detectResourceHandles(graph)

  if (handles.length === 0 && !graph.hasReturnCleanup) {
    return { hasContract: false, contracts: [] }
  }

  // Find which lines are inside cleanup paths
  const cleanupPathLines = findCleanupPathLines(bodyLines)

  // If the handler returns a cleanup function at all, that's a strong signal
  // even before we find a matching handle
  const hasCleanupReturn = bodyLines.some(
    (l, i) => RETURN_CLEANUP_RE.test(l) && cleanupPathLines.has(i)
  )

  const contracts = []

  for (const handle of handles) {
    const { varName, kind, creationLine } = handle

    // Phase 2 — resource USE after creation
    // Look for the variable name being referenced on lines after creationLine
    const usedAfterCreation = bodyLines.some(
      (l, i) => i > creationLine && new RegExp(`\\b${varName}\\b`).test(l)
    )
    if (!usedAfterCreation) continue

    // Phase 3 — cleanup wiring
    // Look for cleanup method called on the variable, inside a cleanup path
    let cleanupLine = -1
    let cleanupKind = null

    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i]
      const isInCleanupPath = cleanupPathLines.has(i)

      // handle.abort() / handle.cancel() etc. in cleanup path
      const cleanupMethodMatch =
        new RegExp(`\\b${varName}${CLEANUP_METHOD_RE.source}`).exec(line)
      if (cleanupMethodMatch && isInCleanupPath) {
        cleanupLine = i
        cleanupKind = cleanupMethodMatch[0].match(CLEANUP_METHOD_RE)?.[1] ?? 'cleanup'
        break
      }

      // clearInterval/clearTimeout(varName) in cleanup path
      const clearTimerMatch = CLEAR_TIMER_RE.exec(line)
      if (clearTimerMatch && clearTimerMatch[2] === varName && isInCleanupPath) {
        cleanupLine = i
        cleanupKind = clearTimerMatch[1]
        break
      }

      // Variable referenced in cleanup path (covers signal: handle.signal patterns)
      if (isInCleanupPath && new RegExp(`\\b${varName}\\b`).test(line)) {
        if (i > creationLine) {
          cleanupLine = i
          cleanupKind = 'reference-in-cleanup'
        }
      }
    }

    if (cleanupLine >= 0) {
      contracts.push({
        varName,
        kind,
        creationLine,
        cleanupLine,
        cleanupKind,
      })
    }
  }

  // Also flag if there's a cleanup return pattern even without a detected handle
  // (covers custom cleanup patterns we don't recognize by class name)
  if (contracts.length === 0 && hasCleanupReturn) {
    contracts.push({
      varName: '__unknown__',
      kind: 'cleanup-return-only',
      creationLine: -1,
      cleanupLine: bodyLines.findIndex(l => RETURN_CLEANUP_RE.test(l)),
      cleanupKind: 'return',
    })
  }

  return {
    hasContract: contracts.length > 0,
    contracts,
  }
}
