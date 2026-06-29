/**
 * data-flow.js
 *
 * Pass 2 of the handler analysis pipeline.
 *
 * Builds a lightweight symbol table + data flow graph for a handler body.
 * This is intentionally NOT a full AST — it operates on lines and uses
 * brace-depth tracking and targeted regex to extract the structural facts
 * that the pattern classifiers need.
 *
 * Output: DataFlowGraph
 *   - symbols: Map<name, SymbolInfo>   — every variable defined in the handler
 *   - callSites: CallSite[]            — every function call with its I/O
 *   - edges: DependencyEdge[]          — A→B means B's input uses A's output
 *   - tryCatchBlocks: TryCatchBlock[]  — try/catch/finally structure
 *   - asyncCallSites: CallSite[]       — subset of callSites that are async
 */

// ─── Regex: symbol table extraction ──────────────────────────────────────────

// const x = expr  /  let x = expr  /  var x = expr
const VAR_ASSIGN_RE =
  /^\s*(?:const|let|var)\s+(\w+)\s*=\s*(.+)/

// const { a, b } = expr   (destructure)
const DESTRUCTURE_ASSIGN_RE =
  /^\s*(?:const|let|var)\s+\{\s*([^}]+)\}\s*=\s*(.+)/

// const [a, b] = expr   (array destructure, e.g. useState)
const ARRAY_DESTRUCTURE_RE =
  /^\s*(?:const|let|var)\s+\[([^\]]+)\]\s*=\s*(.+)/

// x = expr   (reassignment, no keyword)
const REASSIGN_RE =
  /^\s*(\w+)\s*=\s*(?!=)(.+)/

// ─── Regex: call site extraction ─────────────────────────────────────────────

// await someCall(...)   or   await obj.method(...)
const AWAIT_CALL_RE =
  /\bawait\s+([\w.]+)\s*\(/g

// someCall(...)   — any call, for non-await detection
// We want the callee name (possibly dotted) before the first (
const CALL_SITE_RE =
  /\b([\w][\w.]*)\s*\(/g

// .then(  .catch(  .finally(  — promise chain
const PROMISE_CHAIN_RE =
  /\.(then|catch|finally)\s*\(/g

// ─── Regex: new Something(...)  — resource creation ──────────────────────────
const NEW_EXPR_RE =
  /\bnew\s+([\w.]+)\s*\(/

// ─── Regex: try/catch/finally structure ──────────────────────────────────────
const TRY_OPEN_RE     = /\btry\s*\{/
const CATCH_OPEN_RE   = /\}\s*catch\s*(?:\([^)]*\))?\s*\{/
const FINALLY_OPEN_RE = /\}\s*finally\s*\{/

// ─── Regex: async / return ────────────────────────────────────────────────────
const ASYNC_FN_RE     = /\basync\b/
const RETURN_RE       = /^\s*return\b/
const RETURN_FN_RE    = /^\s*return\s*\(\)\s*=>/   // cleanup return

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Count occurrences of a single character in a string,
 * ignoring those inside string literals.
 */
function countCharOutsideStrings(str, ch) {
  let count = 0
  let inStr = false
  let strChar = ''
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (inStr) {
      if (c === strChar && str[i - 1] !== '\\') inStr = false
    } else {
      if (c === '"' || c === "'" || c === '`') { inStr = true; strChar = c }
      else if (c === ch) count++
    }
  }
  return count
}

/**
 * Extract all top-level identifiers referenced in an expression string.
 * "Top-level" means not inside a nested call's argument list.
 * This is intentionally approximate — we want the variables that feed the call,
 * not a full expression tree.
 */
function extractReferencedVars(expr) {
  if (!expr) return new Set()
  const vars = new Set()
  // Remove string literals to avoid false matches
  const cleaned = expr
    .replace(/`[^`]*`/g, 'TEMPLATE')
    .replace(/"[^"]*"/g, 'STR')
    .replace(/'[^']*'/g, 'STR')
  // Match identifiers that are not immediately followed by ( (not calls)
  // and not preceded by . (not property accesses)
  const tokens = cleaned.match(/(?<!\.)(?<!\w)\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b(?!\s*\()/g) || []
  const KEYWORDS = new Set([
    'true', 'false', 'null', 'undefined', 'new', 'return', 'await',
    'async', 'const', 'let', 'var', 'if', 'else', 'for', 'while',
    'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof',
  ])
  for (const t of tokens) {
    if (!KEYWORDS.has(t)) vars.add(t)
  }
  return vars
}

/**
 * Given a line, extract all function-call names (the callee before the `(`).
 * Returns array of strings like 'fetch', 'api.post', 'navigate'.
 */
function extractCallNames(line) {
  const names = []
  // Reset lastIndex before each use
  const re = new RegExp(CALL_SITE_RE.source, 'g')
  let m
  while ((m = re.exec(line)) !== null) {
    const name = m[1]
    // Skip keywords that look like calls: if(...), while(...), for(...)
    const SKIP = new Set(['if', 'while', 'for', 'switch', 'catch', 'return', 'typeof', 'new'])
    if (!SKIP.has(name.split('.')[0])) {
      names.push(name)
    }
  }
  return names
}

// ─── TryCatchBlock extraction ─────────────────────────────────────────────────

/**
 * Walk bodyLines and extract try/catch/finally blocks with their line ranges
 * and which "phase" each line belongs to ('try' | 'catch' | 'finally').
 *
 * Returns TryCatchBlock[]:
 *   { tryLines, catchLines, finallyLines, hasFinally, hasCatch }
 */
export function extractTryCatchBlocks(bodyLines) {
  const blocks = []
  let i = 0

  while (i < bodyLines.length) {
    const line = bodyLines[i]

    if (!TRY_OPEN_RE.test(line)) { i++; continue }

    // Found a try block — collect try / catch / finally phases
    const tryLines = []
    const catchLines = []
    const finallyLines = []
    let phase = 'try'
    let depth = 0
    let started = false

    while (i < bodyLines.length) {
      const l = bodyLines[i]

      // Phase transitions — check before depth counting so we don't
      // misattribute the `}` that closes the try body
      if (started && depth === 1) {
        if (CATCH_OPEN_RE.test(l))   { phase = 'catch';   i++; depth = 1; continue }
        if (FINALLY_OPEN_RE.test(l)) { phase = 'finally'; i++; depth = 1; continue }
      }

      if (phase === 'try')     tryLines.push(l)
      else if (phase === 'catch')   catchLines.push(l)
      else if (phase === 'finally') finallyLines.push(l)

      const opens  = countCharOutsideStrings(l, '{')
      const closes = countCharOutsideStrings(l, '}')
      depth += opens - closes
      if (opens > 0) started = true

      if (started && depth <= 0) { i++; break }
      i++
    }

    blocks.push({
      tryLines,
      catchLines,
      finallyLines,
      hasCatch:   catchLines.length > 0,
      hasFinally: finallyLines.length > 0,
    })
  }

  return blocks
}

// ─── Main graph builder ───────────────────────────────────────────────────────

/**
 * Build a DataFlowGraph for a handler body.
 *
 * @param {string[]} bodyLines  — lines of the handler body (including signature)
 * @returns {DataFlowGraph}
 */
export function buildDataFlowGraph(bodyLines) {
  /** @type {Map<string, SymbolInfo>} */
  const symbols = new Map()

  /** @type {CallSite[]} */
  const callSites = []

  const isAsync = bodyLines.some(l => ASYNC_FN_RE.test(l))
  const hasReturnCleanup = bodyLines.some(l => RETURN_FN_RE.test(l))

  // ── Pass A: symbol table ──────────────────────────────────────────────────
  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i]

    // const/let/var x = expr
    let m = VAR_ASSIGN_RE.exec(line)
    if (m) {
      const [, name, rhs] = m
      symbols.set(name, {
        name,
        line: i,
        rhs: rhs.trim(),
        isNew: NEW_EXPR_RE.test(rhs),
        newClass: (NEW_EXPR_RE.exec(rhs) || [])[1] ?? null,
        referencedBy: new Set(),   // filled in Pass C
        feeds: new Set(),          // filled in Pass C
      })
      continue
    }

    // const { a, b } = expr
    m = DESTRUCTURE_ASSIGN_RE.exec(line)
    if (m) {
      const [, keys, rhs] = m
      for (const key of keys.split(',').map(k => k.trim().split(':')[0].trim())) {
        if (!key) continue
        symbols.set(key, {
          name: key,
          line: i,
          rhs: rhs.trim(),
          isNew: false,
          newClass: null,
          referencedBy: new Set(),
          feeds: new Set(),
          destructuredFrom: rhs.trim(),
        })
      }
      continue
    }

    // const [a, b] = expr
    m = ARRAY_DESTRUCTURE_RE.exec(line)
    if (m) {
      const [, keys, rhs] = m
      for (const key of keys.split(',').map(k => k.trim())) {
        if (!key || key === '_') continue
        symbols.set(key, {
          name: key,
          line: i,
          rhs: rhs.trim(),
          isNew: false,
          newClass: null,
          referencedBy: new Set(),
          feeds: new Set(),
          destructuredFrom: rhs.trim(),
        })
      }
      continue
    }

    // x = expr (reassignment)
    m = REASSIGN_RE.exec(line)
    if (m) {
      const [, name, rhs] = m
      // Only update if already known — don't create from a reassignment
      if (symbols.has(name)) {
        const sym = symbols.get(name)
        sym.reassigned = true
        sym.lastRhs = rhs.trim()
      }
    }
  }

  // ── Pass B: call sites ────────────────────────────────────────────────────
  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i]

    // Find await calls
    const awaitRe = new RegExp(AWAIT_CALL_RE.source, 'g')
    let m
    while ((m = awaitRe.exec(line)) !== null) {
      const callee = m[1]
      const inputVars = extractReferencedVars(line)

      // outputVar: look for   const x = await ...  or  x = await ...
      let outputVar = null
      const assignMatch = /(?:const|let|var)\s+(\w+)\s*=/.exec(line)
        || /^\s*(\w+)\s*=\s*await/.exec(line)
      if (assignMatch) outputVar = assignMatch[1]

      callSites.push({
        callee,
        line: i,
        isAsync: true,
        isAwait: true,
        inputVars,
        outputVar,
      })
    }

    // Find promise chains
    if (PROMISE_CHAIN_RE.test(line)) {
      callSites.push({
        callee: '__promise_chain__',
        line: i,
        isAsync: true,
        isAwait: false,
        inputVars: extractReferencedVars(line),
        outputVar: null,
      })
    }
  }

  // ── Pass C: build dependency edges ───────────────────────────────────────
  /** @type {DependencyEdge[]} */
  const edges = []

  for (let a = 0; a < callSites.length; a++) {
    for (let b = 0; b < callSites.length; b++) {
      if (a === b) continue
      const siteA = callSites[a]
      const siteB = callSites[b]

      // B depends on A if B's input variables include A's output variable
      if (
        siteA.outputVar &&
        siteB.inputVars.has(siteA.outputVar)
      ) {
        edges.push({ from: a, to: b, via: siteA.outputVar })

        // Update symbol feeds/referencedBy
        if (symbols.has(siteA.outputVar)) {
          symbols.get(siteA.outputVar).feeds.add(b)
        }
      }
    }
  }

  // ── Pass D: try/catch blocks ──────────────────────────────────────────────
  const tryCatchBlocks = extractTryCatchBlocks(bodyLines)

  return {
    symbols,
    callSites,
    asyncCallSites: callSites.filter(c => c.isAsync),
    edges,
    tryCatchBlocks,
    isAsync,
    hasReturnCleanup,
  }
}

/**
 * Given a DataFlowGraph, compute the connected components of the
 * async call dependency graph.
 *
 * Returns: number[][] — each inner array is a group of callSite indices
 *   that are connected (directly or transitively dependent).
 *   Indices that have no edges at all form singleton groups.
 */
export function computeAsyncComponents(graph) {
  const { asyncCallSites, edges } = graph

  if (asyncCallSites.length === 0) return []

  // Build adjacency list over async call site indices
  // (edges reference indices into callSites, not asyncCallSites,
  //  so we need to re-index)
  const asyncIndices = new Set(
    asyncCallSites.map((_, i) =>
      graph.callSites.indexOf(asyncCallSites[i])
    )
  )

  const adj = new Map()
  for (const idx of asyncIndices) adj.set(idx, new Set())

  for (const edge of edges) {
    if (asyncIndices.has(edge.from) && asyncIndices.has(edge.to)) {
      adj.get(edge.from).add(edge.to)
      adj.get(edge.to).add(edge.from)   // undirected for component detection
    }
  }

  // Union-Find
  const parent = new Map()
  for (const idx of asyncIndices) parent.set(idx, idx)

  function find(x) {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)))
    return parent.get(x)
  }

  function union(x, y) {
    parent.set(find(x), find(y))
  }

  for (const [from, neighbors] of adj) {
    for (const to of neighbors) union(from, to)
  }

  // Group by root
  const groups = new Map()
  for (const idx of asyncIndices) {
    const root = find(idx)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(idx)
  }

  return [...groups.values()]
}
