/**
 * stage-classifier.js
 *
 * Pass 3+4: Stage Classification
 *
 * Runs all four sub-algorithm detectors against the DataFlowGraph and
 * handler body, then assigns a Stage 1–10 verdict with a promotion ruling.
 *
 * Stage table:
 *   1  Inline Ephemeral         — inline arrow in JSX, no name
 *   2  Named Relay              — delegates to one setter or call, no logic
 *   3  Guarded Relay            — one early-return guard + one action
 *   4  Sequential Mutator       — multiple setters, no branching, no async
 *   5  Branching Mutator        — if/else on state, not a state machine
 *   6  Async Fire-and-Forget    — async/await or promise chain, no try/catch
 *   7  Async Lifecycle Manager  — try/catch + co-mutation cluster  (boundary)
 *   8  State Machine Handler    — switch/if-else state machine       (must promote)
 *   9  Multi-Concern Orchestrator — independent async clusters       (must promote)
 *  10  Lifecycle-Aware Handler  — owns a cleanup contract            (must promote)
 *
 * Promotion rulings:
 *   MUST_PROMOTE    — stage 8, 9, 10
 *   CONSIDER_PROMOTE — stage 7 with cluster identity
 *   OK              — stages 1–6 (and 7 without cluster identity)
 */

import { buildDataFlowGraph } from './data-flow.js'
import { detectLifecycleContract } from './lifecycle-contract.js'
import { detectOrchestration } from './orchestration.js'
import { detectCoMutationCluster } from './co-mutation.js'
import { detectStateMachine } from './state-machine.js'

// ─── Regex: simple structural signals ────────────────────────────────────────

const ASYNC_RE        = /\basync\b/
const AWAIT_RE        = /\bawait\b/
const PROMISE_RE      = /\.(then|catch|finally)\s*\(/
const TRY_CATCH_RE    = /\btry\s*\{/
const GUARD_RETURN_RE = /^\s*if\s*\([^)]+\)\s*return\b/
const SETTER_RE       = /\bset[A-Z]\w*\s*\(/g
const IF_ELSE_RE      = /\bif\s*\(|\belse\b/

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasAsync(lines)        { return lines.some(l => ASYNC_RE.test(l) || AWAIT_RE.test(l)) }
function hasPromiseChain(lines) { return lines.some(l => PROMISE_RE.test(l)) }
function hasTryCatch(lines)     { return lines.some(l => TRY_CATCH_RE.test(l)) }
function hasGuardReturn(lines)  { return lines.some(l => GUARD_RETURN_RE.test(l.trim())) }
function hasBranching(lines)    { return lines.some(l => IF_ELSE_RE.test(l)) }

function countSetterCalls(lines) {
  const text = lines.join('\n')
  const re = new RegExp(SETTER_RE.source, 'g')
  return (text.match(re) ?? []).length
}

function countDistinctSetters(lines) {
  const text = lines.join('\n')
  const re = new RegExp(SETTER_RE.source, 'g')
  const names = new Set()
  let m
  while ((m = re.exec(text)) !== null) names.add(m[0].replace(/\s*\($/, ''))
  return names.size
}

// ─── Stage classifier ─────────────────────────────────────────────────────────

/**
 * Classify a handler body into a stage and produce a promotion verdict.
 *
 * @param {string[]} bodyLines    — lines of the handler (including signature)
 * @returns {ClassificationResult}
 */
export function classifyHandler(bodyLines) {
  // Build the data flow graph — shared by all sub-algorithms
  const graph = buildDataFlowGraph(bodyLines)

  // Run all four sub-algorithm detectors in parallel
  const lifecycle    = detectLifecycleContract(bodyLines, graph)
  const orchestration = detectOrchestration(bodyLines, graph)
  const coMutation   = detectCoMutationCluster(bodyLines, graph)
  const stateMachine = detectStateMachine(bodyLines)

  // ── Stage 10: Lifecycle-Aware Handler ──────────────────────────────────────
  // Owns a cleanup contract — MUST become useEffect or a hook.
  if (lifecycle.hasContract) {
    return result(10, 'MUST_PROMOTE', {
      reason: 'manages a lifecycle contract (resource creation + cleanup wiring) — belongs in useEffect or a custom hook',
      target: 'useEffect',
      lifecycle,
      orchestration,
      coMutation,
      stateMachine,
      graph,
    })
  }

  // ── Stage 9: Multi-Concern Orchestrator ────────────────────────────────────
  // Coordinates 2+ independent async concerns — MUST become hook or service.
  if (orchestration.isOrchestration) {
    return result(9, 'MUST_PROMOTE', {
      reason: `orchestrates ${orchestration.clusterCount} independent async concerns — belongs in a custom hook or service`,
      target: 'hook',
      lifecycle,
      orchestration,
      coMutation,
      stateMachine,
      graph,
    })
  }

  // ── Stage 8: State Machine Handler ────────────────────────────────────────
  // Describes state transitions — MUST become a hook.
  if (stateMachine.isStateMachine) {
    const pivot = stateMachine.pivotVar ? ` on '${stateMachine.pivotVar}'` : ''
    return result(8, 'MUST_PROMOTE', {
      reason: `describes state machine transitions${pivot} (${stateMachine.armCount} arms, ${Math.round(stateMachine.setterOverlap * 100)}% setter overlap) — belongs in a hook`,
      target: 'hook',
      lifecycle,
      orchestration,
      coMutation,
      stateMachine,
      graph,
    })
  }

  // ── Stage 7: Async Lifecycle Manager ──────────────────────────────────────
  // Has try/catch + a semantically coupled co-mutation cluster.
  // This is the boundary stage — CONSIDER promoting, not MUST.
  if (hasTryCatch(bodyLines) && coMutation.hasCluster) {
    const cluster = coMutation.clusters[0]
    return result(7, 'CONSIDER_PROMOTE', {
      reason: `manages co-mutated state cluster [${cluster.setterNames.join(', ')}] inside try/catch — if this pattern recurs or the component is crowded, extract to a custom hook`,
      target: 'hook',
      lifecycle,
      orchestration,
      coMutation,
      stateMachine,
      graph,
    })
  }

  // ── Stage 6: Async Fire-and-Forget ────────────────────────────────────────
  // Has async/await or promise chain, but no try/catch error handling.
  if ((hasAsync(bodyLines) || hasPromiseChain(bodyLines)) && !hasTryCatch(bodyLines)) {
    return result(6, 'OK', {
      reason: 'async handler without error handling — valid, but consider adding try/catch',
      lifecycle,
      orchestration,
      coMutation,
      stateMachine,
      graph,
    })
  }

  // ── Stage 5: Branching Mutator ────────────────────────────────────────────
  // Has if/else branching on state, but not a state machine pattern.
  if (hasBranching(bodyLines) && stateMachine.isBranchingMutator) {
    return result(5, 'OK', {
      reason: 'branches on state values — valid handler, independent reactive paths',
      lifecycle,
      orchestration,
      coMutation,
      stateMachine,
      graph,
    })
  }

  // ── Stage 4: Sequential Mutator ───────────────────────────────────────────
  // 3+ distinct setters in sequence, no branching, no async.
  if (countDistinctSetters(bodyLines) >= 3 && !hasBranching(bodyLines) && !hasAsync(bodyLines)) {
    return result(4, 'OK', {
      reason: 'sequential state mutation — valid handler',
      lifecycle,
      orchestration,
      coMutation,
      stateMachine,
      graph,
    })
  }

  // ── Stage 3: Guarded Relay ────────────────────────────────────────────────
  // One early-return guard + delegates to one action.
  if (hasGuardReturn(bodyLines) && !hasAsync(bodyLines)) {
    return result(3, 'OK', {
      reason: 'guarded relay — valid handler',
      lifecycle,
      orchestration,
      coMutation,
      stateMachine,
      graph,
    })
  }

  // ── Stage 2: Named Relay ──────────────────────────────────────────────────
  // Simple delegation — one or two setters, no branching.
  if (countDistinctSetters(bodyLines) <= 2 && !hasBranching(bodyLines)) {
    return result(2, 'OK', {
      reason: 'named relay — valid handler',
      lifecycle,
      orchestration,
      coMutation,
      stateMachine,
      graph,
    })
  }

  // ── Stage 1: Inline Ephemeral / Fallback ──────────────────────────────────
  return result(1, 'OK', {
    reason: 'minimal inline handler',
    lifecycle,
    orchestration,
    coMutation,
    stateMachine,
    graph,
  })
}

function result(stage, verdict, detail) {
  return { stage, verdict, ...detail }
}

// ─── Promotion message builders ───────────────────────────────────────────────

/**
 * Build a human-readable violation message for a handler.
 *
 * @param {string} handlerName
 * @param {number} startLine
 * @param {number} endLine
 * @param {ClassificationResult} classification
 * @returns {string}
 */
export function buildViolationMessage(handlerName, startLine, endLine, classification) {
  const { stage, verdict, reason } = classification
  const range = `L${startLine}–${endLine}`

  if (verdict === 'MUST_PROMOTE') {
    return `${handlerName} (Stage ${stage}, ${range}): ${reason}.`
  }

  if (verdict === 'CONSIDER_PROMOTE') {
    return `${handlerName} (Stage ${stage}, ${range}): ${reason}.`
  }

  return null  // OK verdict → no violation
}
