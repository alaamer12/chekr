/**
 * orchestration.js
 *
 * Sub-Algorithm 2: Orchestration vs. Pipeline Detection
 *
 * The core question: does this handler coordinate MULTIPLE INDEPENDENT async
 * concerns, or does it execute SEQUENTIAL STEPS of ONE concern?
 *
 * Two async calls are INDEPENDENT (orchestration) when:
 *   - Neither call's output feeds the other's input (no data dependency)
 *   - Either could fail without necessarily invalidating the other
 *
 * Two async calls are DEPENDENT (pipeline / one concern) when:
 *   - Call B receives the output of Call A  (result flows downstream)
 *   - They operate on the same entity across steps
 *
 * Detection strategy:
 *   1. Use the DataFlowGraph's dependency edges to find connected components
 *      among the async call sites.
 *   2. Each connected component = one "concern" (calls that share data).
 *   3. Multiple components = orchestration.
 *   4. One component = pipeline (one sequential concern).
 *
 * Secondary signal (domain diversity):
 *   Even within a single pipeline, if the calls touch fundamentally different
 *   semantic domains (storage vs. notification vs. navigation), we note it —
 *   but this is CORROBORATING evidence, never the primary signal.
 *
 * This entirely replaces the ORCHESTRATION_DOMAINS regex dictionary.
 * Domain names are NOT what makes something orchestration — independence is.
 */

import { computeAsyncComponents } from './data-flow.js'

// ─── Minimum independent clusters to call it orchestration ───────────────────
const ORCHESTRATION_MIN_CLUSTERS = 2

// ─── Secondary: semantic domain classification ────────────────────────────────
// Used only for producing a human-readable description of what the clusters do.
// NOT used to determine whether something is orchestration.
//
// Each domain is detected from the callee name. We use structural patterns
// (verb prefixes, object types) rather than fixed dictionaries.

const DOMAIN_PATTERNS = [
  // State management (Redux/Zustand/etc. dispatch)
  { domain: 'state-dispatch',  re: /^dispatch$/ },

  // Navigation — verbs that clearly mean "go somewhere"
  { domain: 'navigation',      re: /^(navigate|push|replace|redirect|go(?:Back|Forward)?|history\.(push|replace))/ },

  // Persistence — verbs that clearly mean "write data"
  { domain: 'persist',         re: /^(save|create|update|delete|remove|upsert|put|patch|post|write|store)\w*/ },

  // Retrieval — verbs that clearly mean "read data"
  { domain: 'fetch',           re: /^(get|fetch|load|read|query|find|search|list|retrieve)\w*/ },

  // Notification / messaging — verbs that send something to someone
  { domain: 'notify',          re: /^(send|notify|emit|publish|broadcast|alert|message|email|sms|push)\w*/ },

  // Analytics / telemetry — verbs that record events
  { domain: 'analytics',       re: /^(track|log|record|report|measure|capture|analytics)\w*/ },

  // Validation — verbs that check / verify
  { domain: 'validate',        re: /^(validate|verify|check|assert|ensure|confirm)\w*/ },

  // Cache / invalidation
  { domain: 'cache',           re: /^(cache|invalidate|bust|refresh|revalidate|prefetch)\w*/ },

  // File / media operations
  { domain: 'file',            re: /^(upload|download|export|import|read|write|parse|encode|decode)\w*/ },

  // Authentication / authorization
  { domain: 'auth',            re: /^(login|logout|authenticate|authorize|signIn|signOut|refresh[Tt]oken)\w*/ },
]

/**
 * Classify a callee name into a semantic domain label.
 * Returns the domain string, or 'unknown' if no pattern matches.
 */
function classifyDomain(callee) {
  // Strip object prefix for matching: api.submitForm → submitForm
  const local = callee.split('.').pop() ?? callee
  for (const { domain, re } of DOMAIN_PATTERNS) {
    if (re.test(local)) return domain
  }
  return 'unknown'
}

// ─── Main detector ────────────────────────────────────────────────────────────

/**
 * Detect whether a handler is orchestrating multiple independent async concerns.
 *
 * @param {string[]} bodyLines
 * @param {DataFlowGraph} graph
 * @returns {OrchestrationResult}
 */
export function detectOrchestration(bodyLines, graph) {
  const { asyncCallSites } = graph

  if (asyncCallSites.length < 2) {
    return {
      isOrchestration: false,
      isPipeline: false,   // single call is neither orchestration nor a pipeline
      independentClusters: [],
      clusterCount: 0,
      totalAsyncCalls: asyncCallSites.length,
    }
  }

  // Get connected components from the dependency graph
  const components = computeAsyncComponents(graph)

  // Map components back to actual CallSite objects for reporting
  const clusters = components.map(componentIndices => {
    const sites = componentIndices.map(i => graph.callSites[i])
    const domains = [...new Set(sites.map(s => classifyDomain(s.callee)))]
    return {
      callSiteIndices: componentIndices,
      callSites: sites,
      domains,
      size: sites.length,
    }
  })

  // Sort clusters by size descending for readability
  clusters.sort((a, b) => b.size - a.size)

  const isOrchestration = clusters.length >= ORCHESTRATION_MIN_CLUSTERS
  const isPipeline = !isOrchestration && asyncCallSites.length >= 2 && clusters.length === 1

  // Secondary: compute domain diversity across ALL async calls
  // (used for description, not verdict)
  const allDomains = new Set(asyncCallSites.map(s => classifyDomain(s.callee)))
  const knownDomains = [...allDomains].filter(d => d !== 'unknown')

  return {
    isOrchestration,
    isPipeline,
    independentClusters: clusters,
    clusterCount: clusters.length,
    totalAsyncCalls: asyncCallSites.length,
    // secondary info
    domainDiversity: {
      domains: knownDomains,
      count: knownDomains.length,
      hasMultipleDomains: knownDomains.length >= 2,
    },
    // human-readable summary
    description: buildDescription(isOrchestration, isPipeline, clusters, knownDomains),
  }
}

function buildDescription(isOrchestration, isPipeline, clusters, domains) {
  if (isOrchestration) {
    const parts = clusters.map((c, i) => {
      const domainLabel = c.domains.filter(d => d !== 'unknown').join('/') || 'unknown'
      return `cluster ${i + 1}: ${c.size} call(s) [${domainLabel}]`
    })
    return `orchestrates ${clusters.length} independent async concerns — ${parts.join('; ')}`
  }
  if (isPipeline) {
    const domainLabel = domains.length > 0 ? domains.join(' → ') : 'unknown domain'
    return `sequential pipeline of ${clusters[0]?.size ?? 0} dependent async steps [${domainLabel}]`
  }
  return 'single async call'
}
