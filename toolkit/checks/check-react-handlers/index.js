/**
 * analyze-handler.js
 *
 * Single public API for the handler analysis pipeline.
 *
 * One function in, one structured result out.
 * All sub-algorithms (data flow graph, lifecycle contract, orchestration,
 * co-mutation, state machine) are internal implementation details —
 * callers never import or invoke them directly.
 *
 * Usage:
 *
 *   import { analyzeHandler } from './analyze-handler.js'
 *
 *   const result = analyzeHandler(bodyLines)
 *
 *   // What stage is this handler?
 *   result.stage          // 1–10
 *
 *   // Should it be promoted?
 *   result.verdict        // 'OK' | 'CONSIDER_PROMOTE' | 'MUST_PROMOTE'
 *
 *   // Why?
 *   result.reason         // human-readable explanation
 *
 *   // What to promote to?
 *   result.target         // 'hook' | 'useEffect' | null
 *
 *   // Violation message (null if verdict is OK)
 *   result.violation      // string | null
 *
 *   // Flat signal summary (what each sub-algorithm found)
 *   result.signals.hasLifecycleContract   // boolean
 *   result.signals.isOrchestration        // boolean
 *   result.signals.isStateMachine         // boolean
 *   result.signals.hasCoMutationCluster   // boolean
 *   result.signals.isAsync                // boolean
 *   result.signals.hasTryCatch            // boolean
 *   result.signals.hasBranching           // boolean
 *   result.signals.distinctSetterCount    // number
 *   result.signals.asyncClusterCount      // number
 *   result.signals.stateMachineArmCount   // number
 *   result.signals.stateMachinePivotVar   // string | null
 *   result.signals.coMutationSetters      // string[]
 *   result.signals.lifecycleContracts     // { varName, kind }[]
 */

import { buildDataFlowGraph } from './data-flow.js'
import { detectLifecycleContract } from './lifecycle-contract.js'
import { detectOrchestration } from './orchestration.js'
import { detectCoMutationCluster } from './co-mutation.js'
import { detectStateMachine } from './state-machine.js'

// ─── Internal structural helpers ─────────────────────────────────────────────

const ASYNC_RE        = /\basync\b|\bawait\b/
const PROMISE_RE      = /\.(then|catch|finally)\s*\(/
const TRY_CATCH_RE    = /\btry\s*\{/
const GUARD_RETURN_RE = /^\s*if\s*\([^)]+\)\s*return\b/
const IF_ELSE_RE      = /\bif\s*\(|\belse\b/
const SETTER_NAME_RE  = /\b(set[A-Z]\w*)\s*\(/g

function hasAsync(lines)        { return lines.some(l => ASYNC_RE.test(l)) }
function hasPromiseChain(lines) { return lines.some(l => PROMISE_RE.test(l)) }
function hasTryCatch(lines)     { return lines.some(l => TRY_CATCH_RE.test(l)) }
function hasGuardReturn(lines)  { return lines.some(l => GUARD_RETURN_RE.test(l.trim())) }
function hasBranching(lines)    { return lines.some(l => IF_ELSE_RE.test(l)) }

function countDistinctSetters(lines) {
  const text = lines.join('\n')
  const re = new RegExp(SETTER_NAME_RE.source, 'g')
  const names = new Set()
  let m
  while ((m = re.exec(text)) !== null) names.add(m[1])
  return names.size
}

// ─── Stage assignment ─────────────────────────────────────────────────────────

function assignStage(bodyLines, lifecycle, orchestration, coMutation, stateMachine) {
  if (lifecycle.hasContract)        return 10
  if (orchestration.isOrchestration) return 9
  if (stateMachine.isStateMachine)  return 8
  if (hasTryCatch(bodyLines) && coMutation.hasCluster) return 7
  if ((hasAsync(bodyLines) || hasPromiseChain(bodyLines)) && !hasTryCatch(bodyLines)) return 6
  if (hasBranching(bodyLines) && stateMachine.isBranchingMutator) return 5
  if (countDistinctSetters(bodyLines) >= 3 && !hasBranching(bodyLines) && !hasAsync(bodyLines)) return 4
  if (hasGuardReturn(bodyLines) && !hasAsync(bodyLines)) return 3
  if (countDistinctSetters(bodyLines) <= 2 && !hasBranching(bodyLines)) return 2
  return 1
}

// ─── Verdict + reason ─────────────────────────────────────────────────────────

function buildVerdict(stage, orchestration, stateMachine, coMutation, lifecycle) {
  switch (stage) {
    case 10: return {
      verdict: 'MUST_PROMOTE',
      reason:  'manages a lifecycle contract (resource creation + cleanup wiring) — belongs in useEffect or a custom hook',
      target:  'useEffect',
    }
    case 9: return {
      verdict: 'MUST_PROMOTE',
      reason:  `orchestrates ${orchestration.clusterCount} independent async concerns — belongs in a custom hook or service`,
      target:  'hook',
    }
    case 8: {
      const pivot = stateMachine.pivotVar ? ` on '${stateMachine.pivotVar}'` : ''
      return {
        verdict: 'MUST_PROMOTE',
        reason:  `describes state machine transitions${pivot} (${stateMachine.armCount} arms, ${Math.round(stateMachine.setterOverlap * 100)}% setter overlap) — belongs in a hook`,
        target:  'hook',
      }
    }
    case 7: {
      const names = coMutation.clusters[0]?.setterNames ?? []
      return {
        verdict: 'CONSIDER_PROMOTE',
        reason:  `manages co-mutated state cluster [${names.join(', ')}] inside try/catch — if this pattern recurs or the component is crowded, extract to a custom hook`,
        target:  'hook',
      }
    }
    case 6: return { verdict: 'OK', reason: 'async handler without error handling — valid, but consider adding try/catch',   target: null }
    case 5: return { verdict: 'OK', reason: 'branches on state values — valid handler, independent reactive paths',          target: null }
    case 4: return { verdict: 'OK', reason: 'sequential state mutation — valid handler',                                     target: null }
    case 3: return { verdict: 'OK', reason: 'guarded relay — valid handler',                                                 target: null }
    case 2: return { verdict: 'OK', reason: 'named relay — valid handler',                                                   target: null }
    default: return { verdict: 'OK', reason: 'minimal inline handler',                                                       target: null }
  }
}

// ─── Signal summary ───────────────────────────────────────────────────────────

function buildSignals(bodyLines, graph, lifecycle, orchestration, coMutation, stateMachine) {
  return {
    // lifecycle
    hasLifecycleContract: lifecycle.hasContract,
    lifecycleContracts:   lifecycle.contracts.map(c => ({ varName: c.varName, kind: c.kind })),

    // orchestration
    isOrchestration:   orchestration.isOrchestration,
    isPipeline:        orchestration.isPipeline,
    asyncClusterCount: orchestration.clusterCount,
    totalAsyncCalls:   orchestration.totalAsyncCalls,

    // state machine
    isStateMachine:        stateMachine.isStateMachine,
    isBranchingMutator:    stateMachine.isBranchingMutator,
    stateMachineKind:      stateMachine.kind,
    stateMachinePivotVar:  stateMachine.pivotVar,
    stateMachineArmCount:  stateMachine.armCount,
    stateMachineOverlap:   stateMachine.setterOverlap,

    // co-mutation
    hasCoMutationCluster: coMutation.hasCluster,
    coMutationSetters:    coMutation.clusters[0]?.setterNames ?? [],
    coMutationSignals:    coMutation.clusters[0]?.signals ?? [],

    // structural
    isAsync:             hasAsync(bodyLines),
    hasPromiseChain:     hasPromiseChain(bodyLines),
    hasTryCatch:         hasTryCatch(bodyLines),
    hasBranching:        hasBranching(bodyLines),
    hasGuardReturn:      hasGuardReturn(bodyLines),
    distinctSetterCount: countDistinctSetters(bodyLines),
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze a handler body and return a complete classification result.
 *
 * @param {string[]} bodyLines  — lines of the handler body (including signature line)
 * @param {object}  [opts]
 * @param {string}  [opts.name]       — handler name, used in violation message
 * @param {number}  [opts.startLine]  — 1-based line number in source file
 * @param {number}  [opts.endLine]    — 1-based line number in source file
 *
 * @returns {HandlerAnalysis}
 */
export function analyzeHandler(bodyLines, opts = {}) {
  const { name = 'handler', startLine = 1, endLine = bodyLines.length } = opts

  // ── Pass 1: data flow graph ──────────────────────────────────────────────
  const graph = buildDataFlowGraph(bodyLines)

  // ── Pass 2: all four sub-algorithm detectors ─────────────────────────────
  const lifecycle     = detectLifecycleContract(bodyLines, graph)
  const orchestration = detectOrchestration(bodyLines, graph)
  const coMutation    = detectCoMutationCluster(bodyLines, graph)
  const stateMachine  = detectStateMachine(bodyLines)

  // ── Pass 3: stage + verdict ──────────────────────────────────────────────
  const stage                    = assignStage(bodyLines, lifecycle, orchestration, coMutation, stateMachine)
  const { verdict, reason, target } = buildVerdict(stage, orchestration, stateMachine, coMutation, lifecycle)

  // ── Pass 4: violation message ────────────────────────────────────────────
  const range     = `L${startLine}–${endLine}`
  const violation = verdict !== 'OK'
    ? `${name} (Stage ${stage}, ${range}): ${reason}.`
    : null

  // ── Pass 5: flat signal summary ──────────────────────────────────────────
  const signals = buildSignals(bodyLines, graph, lifecycle, orchestration, coMutation, stateMachine)

  return {
    // core result
    stage,
    verdict,
    reason,
    target,
    violation,

    // per-signal detail — for debug output, test assertions, CLI hints
    signals,
  }
}
