/**
 * Step 40: check-code-duplication
 *
 * Detects duplicated JSX / React UI blocks across scoped source files using
 * structure + style + attribute similarity (packages/toolkit/utils/jsx-dedup.js).
 *
 * Score: compareBlocks() global confidence 0–100 (weighted node matches / total nodes).
 * Violation when score > DUPLICATION_SCORE_THRESHOLD.
 *
 * Scope: capabilities/, apps/, packages/shell/
 * Excludes: tests, stories, node_modules, primitives/toolkit internals
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { buildIgnoredLines } from "@chekr/utils";
import { detectComponents } from "../../support/react-loc-counter.js";
import { compareBlocks, buildTree, serializeBlock, DEFAULT_CONFIG } from "../../support/jsx-dedup.js";
import { walkFiles } from "@chekr/utils";
import { matchesScope } from "../../support/scope-matcher.js";
import { createMeshOptimizer } from "@chekr/cli/mesh";

/** Duplication confidence (0–100) above which a pair is reported. */
export const DUPLICATION_SCORE_THRESHOLD = 75;

const SCOPE = ["capabilities/", "apps/", "packages/shell/"];
const EXTENSIONS = [".tsx", ".jsx", ".ts", ".js"];

const MIN_COMPONENT_LOC = 8;
const MIN_BODY_CHARS = 60;

/** JSX inside return (…) — compareBlocks expects markup, not the full function wrapper. */
export function extractJsxReturnBody(bodyLines) {
	const text = bodyLines.join("\n");
	const returnIdx = text.search(/\breturn\s*\(/);
	if (returnIdx === -1) return text;

	let depth = 0;
	let started = false;
	let start = -1;
	for (let i = returnIdx; i < text.length; i++) {
		const ch = text[i];
		if (ch === "(") {
			depth++;
			if (depth === 1) {
				started = true;
				start = i + 1;
			}
		} else if (ch === ")") {
			depth--;
			if (started && depth === 0) {
				return text.slice(start, i).trim();
			}
		}
	}
	return text;
}

const SKIP_PATH_SEGMENTS = [
	"node_modules/",
	"packages/primitives/",
	"packages/toolkit/",
	"packages/shell/node_modules/",
	"__tests__/",
	"/dist/",
	"/build/",
	"/.turbo/",
	"/coverage/",
];

export function shouldScanFile(filePath) {
	const normalised = filePath.replace(/\\/g, "/");
	if (!matchesScope(normalised, SCOPE)) return false;
	if (!EXTENSIONS.some(ext => normalised.endsWith(ext))) return false;
	if (SKIP_PATH_SEGMENTS.some(seg => normalised.includes(seg))) return false;
	if (/\.(test|spec)\.[jt]sx?$/.test(normalised)) return false;
	if (/\.stories\.(tsx?|jsx?)$/.test(normalised)) return false;
	return true;
}

function isLineIgnored(lineNum, ignored) {
	return ignored.has(lineNum);
}

function isComponentIgnored(startLine, endLine, ignored) {
	for (let ln = startLine; ln <= endLine; ln++) {
		if (isLineIgnored(ln, ignored)) return true;
	}
	return false;
}

/**
 * @param {string} source
 * @param {string} filePath
 * @returns {{ file: string, name: string, startLine: number, endLine: number, body: string }[]}
 */
export function extractComponentsFromSource(source, filePath) {
	if (!shouldScanFile(filePath)) return [];

	const lines = source.split("\n");
	const ignored = buildIgnoredLines(lines);
	const components = detectComponents(lines);

	const blocks = [];
	for (const comp of components) {
		if (comp.loc < MIN_COMPONENT_LOC) continue;
		if (isComponentIgnored(comp.startLine, comp.endLine, ignored)) continue;

		const jsxBody = extractJsxReturnBody(comp.bodyLines);
		if (jsxBody.length < MIN_BODY_CHARS) continue;

		blocks.push({
			file: filePath.replace(/\\/g, "/"),
			name: comp.name,
			startLine: comp.startLine,
			endLine: comp.endLine,
			body: jsxBody,
		});
	}
	return blocks;
}

/**
 * @param {{ file: string, name: string, startLine: number, endLine: number, body: string }} a
 * @param {{ file: string, name: string, startLine: number, endLine: number, body: string }} b
 */
export function compareComponentPair(a, b) {
	return compareBlocks(a.body, b.body);
}

/** Minimum body-length ratio before running expensive compareBlocks. */
const MIN_LENGTH_RATIO = 0.55;

function blockSignature(body) {
	try {
		const tree = buildTree(body, DEFAULT_CONFIG.styleAs);
		return serializeBlock(tree, DEFAULT_CONFIG.level, DEFAULT_CONFIG.matchMode);
	} catch {
		return "";
	}
}

function lengthRatio(a, b) {
	const la = a.body.length;
	const lb = b.body.length;
	return Math.min(la, lb) / Math.max(la, lb);
}

/** Top-level scan root: capabilities, apps, or packages */
function scopeRoot(filePath) {
	return filePath.replace(/\\/g, "/").split("/")[0] ?? "";
}

function shouldCompareCandidates(a, b) {
	if (a.file === b.file) return false;
	if (lengthRatio(a, b) < MIN_LENGTH_RATIO) return false;
	return scopeRoot(a.file) === scopeRoot(b.file);
}

/**
 * @param {{ file: string, name: string, startLine: number, endLine: number, body: string, signature?: string }[]} blocks
 * @returns {{ score: number, a: typeof blocks[0], b: typeof blocks[0] }[]}
 */
export function findHighDuplicationPairs(blocks) {
	const enriched = blocks.map(block => ({
		...block,
		signature: block.signature ?? blockSignature(block.body),
	}));

	const pairs = [];
	const seen = new Set();

	const recordPair = (a, b, score) => {
		const key = [a.file, a.startLine, b.file, b.startLine].sort().join("|");
		if (seen.has(key)) return;
		seen.add(key);
		pairs.push({ score, a, b });
	};

	// Fast path: identical serialized structure within a capability
	const bySignature = new Map();
	for (const block of enriched) {
		if (!block.signature) continue;
		const bucketKey = `${scopeRoot(block.file)}::${block.signature}`;
		if (!bySignature.has(bucketKey)) bySignature.set(bucketKey, []);
		bySignature.get(bucketKey).push(block);
	}

	for (const group of bySignature.values()) {
		if (group.length < 2) continue;
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				const a = group[i];
				const b = group[j];
				if (a.file === b.file) continue;
				const { confidence } = compareComponentPair(a, b);
				if (confidence > DUPLICATION_SCORE_THRESHOLD) {
					recordPair(a, b, confidence);
				}
			}
		}
	}

	// Fuzzy path: similar-length blocks under the same scope root (capabilities / apps / packages)
	const byScope = new Map();
	for (const block of enriched) {
		const root = scopeRoot(block.file);
		if (!byScope.has(root)) byScope.set(root, []);
		byScope.get(root).push(block);
	}

	for (const group of byScope.values()) {
		if (group.length < 2) continue;
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				const a = group[i];
				const b = group[j];
				if (!shouldCompareCandidates(a, b)) continue;
				if (a.signature && b.signature && a.signature === b.signature) continue;

				const { confidence } = compareComponentPair(a, b);
				if (confidence > DUPLICATION_SCORE_THRESHOLD) {
					recordPair(a, b, confidence);
				}
			}
		}
	}

	return pairs;
}

function suggestSharedPath(fileA, fileB) {
	const normA = fileA.replace(/\\/g, "/");
	const normB = fileB.replace(/\\/g, "/");
	const partsA = normA.split("/");
	const partsB = normB.split("/");
	const common = [];
	for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
		if (partsA[i] !== partsB[i]) break;
		common.push(partsA[i]);
	}
	if (common.length >= 2) {
		return `${common.join("/")}/shared/`;
	}
	return "a shared helper module under the same capability or package";
}

/**
 * @param {{ score: number, a: object, b: object }[]} pairs
 * @returns {import('chekr').Violation[]}
 */
export function pairsToViolations(pairs) {
  return pairs.map(({ score, a, b }) => {
    const hint = suggestSharedPath(a.file, b.file);
    const rangeA = `L${a.startLine}–${a.endLine}`;
    const rangeB = `L${b.startLine}–${b.endLine}`;

    // Unique ID for this specific duplication cluster (sorted files + score)
    const logicalId = `duplication:${[a.file, b.file].sort().join("|")}`;

    return {
      file: b.file,
      line: b.startLine,
      _files: [a.file, b.file], // Hidden metadata for caching
      text: b.name,
      message: `Duplication score ${score} (>${DUPLICATION_SCORE_THRESHOLD}): ${b.name} looks like ${a.name}. Extract shared JSX into ${hint}.`,
      impact: "Increased maintenance cost and bundle size due to redundant code.",
      logicalId,
      fix: `Extract duplicated UI into a shared component or helper (e.g. ${hint}) and import it in both files.`,
      occurrences: [
        {
          file: a.file,
          line: a.startLine,
          text: `${a.name} (${rangeA})`,
          context: "Similar block found here",
        },
      ],
      data: {
        score,
        threshold: DUPLICATION_SCORE_THRESHOLD,
        componentA: a.name,
        componentB: b.name,
      },
    };
  });
}

/** @param {string} scanPath */
export function collectScopedSourceFiles(scanPath = ".") {
	const resolvedScan = resolve(scanPath);
	const roots = ["capabilities", "apps", "packages/shell"];
	const files = [];
	for (const root of roots) {
		const dir = join(resolvedScan, root);
		if (!existsSync(dir)) continue;
		for (const walked of walkFiles(dir, EXTENSIONS)) {
			const abs = resolve(walked);
			files.push(relative(resolvedScan, abs).replace(/\\/g, "/"));
		}
	}
	return files.filter(shouldScanFile);
}

/**
 * @param {string} [scanPath]
 * @param {string[] | null} [prefilteredFiles]
 * @param {((done: number, total: number) => void) | null} [onProgress]
 * @param {object} [context=null]
 */
export async function checkCodeDuplicationRepo(scanPath = ".", prefilteredFiles = null, onProgress = null, context = null) {
	const files = prefilteredFiles?.filter(shouldScanFile) ?? collectScopedSourceFiles(scanPath);
	const resolvedRoot = resolve(scanPath);

	// ── Phase 1: Parse files for component blocks ──
	const mesh = createMeshOptimizer(context);
	mesh.announce();

	const blocks = [];
	let parsed = 0;
	for (const relPath of files) {
		const absolute = join(resolvedRoot, relPath);
		if (!existsSync(absolute)) { parsed++; continue; }

		let source;
		try {
			source = readFileSync(absolute, "utf8");
		} catch {
			parsed++;
			continue;
		}
		blocks.push(...extractComponentsFromSource(source, relPath));
		parsed++;
		if (onProgress) onProgress(parsed, files.length);
	}

	// ── Phase 2: Batched fuzzy comparison ──
	// All shared state is mutated only inside synchronous batch runs (single-threaded),
	// never across concurrent async tasks — no race conditions possible.
	const enriched = blocks.map(block => ({
		...block,
		signature: block.signature ?? blockSignature(block.body),
	}));

	const pairs = [];
	const seen = new Set();

	const recordPair = (a, b, score) => {
		const key = [a.file, a.startLine, b.file, b.startLine].sort().join("|");
		if (seen.has(key)) return;
		seen.add(key);
		pairs.push({ score, a, b });
	};

	// Fast path: identical serialized structure within the same scope root
	const bySignature = new Map();
	for (const block of enriched) {
		if (!block.signature) continue;
		const bucketKey = `${scopeRoot(block.file)}::${block.signature}`;
		if (!bySignature.has(bucketKey)) bySignature.set(bucketKey, []);
		bySignature.get(bucketKey).push(block);
	}

	for (const group of bySignature.values()) {
		if (group.length < 2) continue;
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				const a = group[i], b = group[j];
				if (a.file === b.file) continue;
				
				if (mesh.skipPair(a.file, b.file)) continue;

				const { confidence } = compareComponentPair(a, b);
				if (confidence > DUPLICATION_SCORE_THRESHOLD) recordPair(a, b, confidence);
			}
		}
	}

	// Fuzzy path: collect ALL candidate pairs from ALL scope groups upfront,
	// then process them in a single unified batching loop.
	// This ensures the progress counter is monotonically increasing and never resets.
	const byScope = new Map();
	for (const block of enriched) {
		const root = scopeRoot(block.file);
		if (!byScope.has(root)) byScope.set(root, []);
		byScope.get(root).push(block);
	}

	// fuzzy path: collect ALL candidate pairs
	const allTasks = [];
	for (const group of byScope.values()) {
		if (group.length < 2) continue;
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				const a = group[i], b = group[j];
				if (!shouldCompareCandidates(a, b)) continue;
				// Skip pairs already handled by the fast-path signature bucket
				if (a.signature && b.signature && a.signature === b.signature) continue;

				if (mesh.skipPair(a.file, b.file)) continue;

				allTasks.push({ a, b });
			}
		}
	}

	// Process in batches of 16, yielding between each batch so the event loop
	// can flush the progress line to stdout. All shared state (pairs, seen) is
	// only touched inside the synchronous inner loop — no concurrent mutation.
	const BATCH_SIZE = 16;
	let done = 0;
	const totalTasks = allTasks.length;

	for (let t = 0; t < totalTasks; t += BATCH_SIZE) {
		// Yield to event loop so stdout progress renders cleanly
		await new Promise(tick => setImmediate(tick));

		const end = Math.min(t + BATCH_SIZE, totalTasks);
		for (let i = t; i < end; i++) {
			const { a, b } = allTasks[i];
			const { confidence } = compareComponentPair(a, b);
			if (confidence > DUPLICATION_SCORE_THRESHOLD) recordPair(a, b, confidence);
		}
		done = end;
		// Progress: show pair-comparison progress only (cleaner than mixing file+pair counts)
		if (onProgress) onProgress(done, totalTasks);
	}

	const newViolations = pairsToViolations(pairs);
	
	return mesh.complete(newViolations);
}


/** Per-file hook for check-all — analysis is repo-level. */
export function checkCodeDuplication() {
	return [];
}
