/**
 * Orchestrator — runs all 10 violation check steps in order.
 * Stops at first failure (normal mode) or runs all steps (--pass mode).
 */

import { readFile } from "node:fs/promises";
import readline from "node:readline";
import { walkFiles } from "./utils/file-walker.js";
import { matchesScope } from "./utils/scope-matcher.js";
import { printStepResult, printViolations, printPassSummary, writeReport } from "./utils/reporter.js";
import { fail, warn, dim } from "./utils/colors.js";

// ─── Inline progress bar ──────────────────────────────────────────────────────
let _progressActive = false;
let _lastRenderTime = 0;
let _activeStepName = null;
let _meshActive = false;

/**
 * Render or clear the shared progress line.
 * Call with (done, total, label) to update; call clearProgress() when done.
 */
function renderProgress(done, total, label = "processing") {
	const now = Date.now();
	// Throttle to ~10 renders/sec globally, unless it's the very last update
	if (done < total && now - _lastRenderTime < 100) return;
	_lastRenderTime = now;

	_progressActive = true;
	const percent = total === 0 ? 100 : Math.round((done / total) * 100);
	
	// Shorter bar (20 chars) to prevent PowerShell wrapping bugs
	const filled = Math.round((done / total) * 20);
	const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(20 - filled);
	
	// Truncate step name, embed ⚡ mesh indicator when active
	let shortName = _activeStepName || "";
	if (shortName.length > 12) shortName = shortName.replace("check-", "").substring(0, 12);
	const meshTag = _meshActive ? "\u26a1" : "";
	const stepPrefix = shortName ? `[${shortName}${meshTag}] ` : "";
	
	let line = `  \u21b3 ${stepPrefix}${bar} ${String(percent).padStart(3)}% | ${done}/${total}`;

	// Extreme safeguard: forcefully truncate to 75 chars to be absolutely safe
	if (line.length > 75) {
		line = line.substring(0, 75);
	}

	readline.clearLine(process.stdout, 0);
	readline.cursorTo(process.stdout, 0);
	process.stdout.write(line);
}

function clearProgress() {
	if (_progressActive) {
		readline.clearLine(process.stdout, 0);
		readline.cursorTo(process.stdout, 0);
		_progressActive = false;
	}
}
import {
	DEFAULT_CACHE_ROOT,
	clearCacheDir,
	contentHash,
	getGitContext,
	isGitAvailable,
	isStepCacheValid,
	formatIncrementalCacheBanner,
	getBranchCacheMeta,
	loadStepCache,
	needsRepoLevelCheck,
	parseModifiedPathsFromStatus,
	partitionFilesByCache,
	saveStepCache,
	saveStepCacheSync,
	stepCachePath,
	getChangedPathsSince,
} from "./utils/check-violations-cache.js";

// Import all check functions
import { checkReinventedHooks } from "./checks/check-reinvented-hooks.js";
import { checkUnknownCast } from "./checks/check-unknown-cast.js";
import { checkUnusedParams } from "./checks/check-unused-params.js";
import { checkReactSrp } from "./checks/check-react-srp.js";
import { checkReactHandlers } from "./checks/check-react-handlers.js";
import { checkDuplicateInterfaces, checkDuplicateInterfacesRepo } from "./checks/check-duplicate-interfaces.js";
import { checkTypiaValidation } from "./checks/check-typia-validation.js";
import { checkCodeDuplication, checkCodeDuplicationRepo } from "./checks/check-code-duplication.js";
import { checkTsconfigPaths, checkTsconfigPathsRepo } from "./checks/check-tsconfig-paths.js";
import { checkLiteralUnions, checkLiteralUnionsRepo } from "./checks/check-literal-unions.js";

const STEPS = [
	{
		step: 1,
		name: "check-reinvented-hooks",
		fn: checkReinventedHooks,
		extensions: [".ts", ".tsx"],
		scope: ["capabilities/", "apps/", "packages/"],
	},
	{
		step: 2,
		name: "check-unknown-cast",
		fn: checkUnknownCast,
		extensions: [".ts", ".tsx"],
		scope: ["capabilities/", "apps/", "packages/"],
	},
	{
		step: 3,
		name: "check-unused-params",
		fn: checkUnusedParams,
		extensions: [".ts", ".tsx"],
		scope: ["capabilities/", "apps/", "packages/"],
	},
	{
		step: 4,
		name: "check-react-srp",
		fn: checkReactSrp,
		extensions: [".ts", ".tsx", ".jsx", ".js"],
		scope: ["capabilities/", "apps/", "packages/shell/"],
	},
	{
		step: 5,
		name: "check-react-handlers",
		fn: checkReactHandlers,
		extensions: [".ts", ".tsx", ".jsx", ".js"],
		scope: ["apps/", "capabilities/"],
	},
	{
		step: 6,
		name: "check-duplicate-interfaces",
		fn: checkDuplicateInterfaces,
		repoFn: checkDuplicateInterfacesRepo,
		extensions: [".ts", ".tsx"],
		scope: ["capabilities/", "apps/", "packages/"],
	},
	{
		step: 7,
		name: "check-typia-validation",
		fn: checkTypiaValidation,
		extensions: [".ts", ".tsx", ".js", ".jsx"],
		scope: ["capabilities/", "apps/", "packages/"],
	},
	{
		step: 8,
		name: "check-code-duplication",
		fn: checkCodeDuplication,
		repoFn: checkCodeDuplicationRepo,
		extensions: [".ts", ".tsx", ".jsx", ".js"],
		scope: ["capabilities/", "apps/", "packages/shell/"],
		optimize: true, // Enable Mesh Optimization for O(N^2) checks
	},
	{
		step: 9,
		name: "check-tsconfig-paths",
		fn: checkTsconfigPaths,
		repoFn: checkTsconfigPathsRepo,
		extensions: [".ts"],
		scope: ["apps/", "capabilities/"],
	},
	{
		step: 10,
		name: "check-literal-unions",
		fn: checkLiteralUnions,
		repoFn: checkLiteralUnionsRepo,
		extensions: [".ts", ".tsx"],
		scope: ["capabilities/", "apps/", "packages/"],
	},
];

async function runChecks() {
	const args = process.argv.slice(2);
	const passMode = args.includes("--pass");
	const noCache = args.includes("--no-cache");
	const clearCache = args.includes("--clear-cache");
	const reportPaths = args.filter(arg => arg.startsWith("--report=")).map(arg => arg.split("=")[1]);
	const scanPath = args.find(arg => !arg.startsWith("--")) || ".";

	if (clearCache) {
		await clearCacheDir(DEFAULT_CACHE_ROOT);
		console.log(dim(`Cleared check-violations cache at ${DEFAULT_CACHE_ROOT}`));
	}

	let cacheEnabled = !noCache;
	let gitContext = null;
	let modifiedPaths = new Set();

	if (cacheEnabled) {
		const gitOk = await isGitAvailable();
		if (!gitOk) {
			console.log(warn("⚠️  git not found on PATH — running full scan without cache."));
			cacheEnabled = false;
		} else {
			gitContext = await getGitContext();
			modifiedPaths = parseModifiedPathsFromStatus(gitContext.status);
			let branchMeta = await getBranchCacheMeta(DEFAULT_CACHE_ROOT, gitContext);

			if (branchMeta && branchMeta.head && branchMeta.head !== gitContext.head) {
				const diffPaths = await getChangedPathsSince(branchMeta.head, gitContext.head);
				if (diffPaths) {
					for (const p of diffPaths) modifiedPaths.add(p);
				} else {
					console.log(warn(`\u26a0\ufe0f  Failed to diff against cached commit. Falling back to full scan.`));
					branchMeta = null;
					gitContext.forceFullScan = true;
				}
			}
			console.log(dim(formatIncrementalCacheBanner(gitContext, branchMeta, modifiedPaths.size)));
		}
	}

	function buildFilesForCache(scopedFiles, checkedFiles, cachedFiles) {
		const filesForCache = {};
		const checkedByFile = new Map(checkedFiles.map(entry => [entry.file, entry]));

		for (const file of scopedFiles) {
			const checked = checkedByFile.get(file);
			if (checked) {
				filesForCache[file] = contentHash(checked.source);
			} else if (cachedFiles?.[file]) {
				filesForCache[file] = cachedFiles[file];
			}
		}
		return filesForCache;
	}

	let _activeScopedFiles = [];
	let _activeCachedFiles = {};
	let _activeCheckedFiles = [];
	let _activeAllViolations = [];

	process.on("SIGINT", () => {
		clearProgress();
		if (cacheEnabled && gitContext && _activeStepName) {
			console.log(warn(`\n⚠️  Interrupted! Saving partial cache for ${_activeStepName}...`));
			const filesForCache = buildFilesForCache(_activeScopedFiles, _activeCheckedFiles, _activeCachedFiles);
			const cachePath = stepCachePath(DEFAULT_CACHE_ROOT, gitContext, _activeStepName);
			saveStepCacheSync(cachePath, gitContext, filesForCache, _activeAllViolations);
		}
		process.exit(1);
	});

	const stepResults = [];
	let failedStep = null;

	// Optimization: Walk the filesystem exactly ONCE instead of 25 times
	const allExtensions = Array.from(new Set(STEPS.flatMap(s => s.extensions)));
	const allWorkspaceFiles = walkFiles(scanPath, allExtensions);

	for (const stepDef of STEPS) {
		const { step, name, fn, repoFn, extensions, scope, optimize } = stepDef;
		// Filter from the pre-computed list
		const files = allWorkspaceFiles.filter(f => extensions.some(ext => f.endsWith(ext)));
		const scopedFiles = files.filter(f => matchesScope(f, scope));
		const allViolations = [];

		_activeStepName = name;
		_activeScopedFiles = scopedFiles;
		_activeAllViolations = allViolations;
		_activeCheckedFiles = [];
		_activeCachedFiles = {};

		let cachedFiles;
		let cachedViolations = [];
		let toCheck = scopedFiles;
		let skipped = [];
		let stepCacheHit = false;

		if (cacheEnabled && gitContext) {
			const cachePath = stepCachePath(DEFAULT_CACHE_ROOT, gitContext, name);
			const stepCache = await loadStepCache(cachePath);
			stepCacheHit = isStepCacheValid(stepCache, gitContext);
			cachedFiles = stepCacheHit ? stepCache.files : undefined;
			cachedViolations = stepCacheHit ? (stepCache.violations || []) : [];
			_activeCachedFiles = cachedFiles || {};
			({ toCheck, skipped } = partitionFilesByCache(scopedFiles, cachedFiles, modifiedPaths));
			
			// Automatically restore old violations for files that were skipped!
			const skippedSet = new Set(skipped);
			const restoredViolations = cachedViolations.filter(v => {
				const files = v._files || [v.file];
				return files.every(f => skippedSet.has(f));
			});
			allViolations.push(...restoredViolations);
		}

		let runRepo = false;
		let meshSkippedPairs = 0;
		if (typeof repoFn === "function") {
			runRepo = !cacheEnabled || !gitContext || needsRepoLevelCheck(scopedFiles, cachedFiles, modifiedPaths);
			if (runRepo) {
				const context = {
					optimize: optimize ?? false,
					unmodifiedFiles: new Set(skipped),
					cachedViolations
				};

				const meshActive = context.optimize && context.unmodifiedFiles.size > 0;
				_meshActive = meshActive;

				// Tell user when mesh can't activate yet
				if (context.optimize && !meshActive) {
					process.stdout.write(`  \u26a1 Mesh: building cache (first run) \u2014 will optimize on next run\n`);
				} else if (meshActive) {
					process.stdout.write(`  \u26a1 Mesh ON: ${context.unmodifiedFiles.size.toLocaleString()} clean files \u2192 skipping U\u00d7U pairs\n`);
				}

				const onProgress = (done, total) => renderProgress(done, total);
				const rawResult = repoFn(scanPath, scopedFiles, onProgress, context);
				const result = rawResult instanceof Promise ? await rawResult : rawResult;
				clearProgress();

				// repoFn returns { violations, meshSkippedPairs } when optimize is set
				if (result && typeof result === 'object' && 'violations' in result) {
					allViolations.push(...result.violations);
					meshSkippedPairs = result.meshSkippedPairs ?? 0;
				} else {
					allViolations.push(...(Array.isArray(result) ? result : []));
				}

				_meshActive = false;
			}
		}

		let checkedFiles = [];
		if (toCheck.length > 0) {
			let checkedCount = 0;
			const totalFiles = toCheck.length;
			let lastRenderTime = 0;

			checkedFiles = await Promise.all(
				toCheck.map(async file => {
					const source = await readFile(file, "utf8");
					const violations = fn(source, file);
					checkedCount++;
					const entry = { file, source, violations };
					_activeCheckedFiles.push(entry);
					renderProgress(checkedCount, totalFiles, 'files checked');
					return entry;
				})
			);
			clearProgress();
		}


		for (const { violations } of checkedFiles) {
			allViolations.push(...violations);
		}

		const status = allViolations.length === 0 ? "pass" : "fail";
		stepResults.push({ step, name, status, violations: allViolations });

		const fullyCached =
			cacheEnabled &&
			stepCacheHit &&
			toCheck.length === 0 &&
			!runRepo &&
			scopedFiles.length > 0 &&
			skipped.length === scopedFiles.length;

		// Progress is already cleared above — print the complete step result line
		printStepResult(step, name, allViolations, {
			fullyCached,
			skipped: skipped.length,
			checked: toCheck.length,
			optimize: optimize ?? false,
			meshSkippedPairs,
		});

		// Save partial cache regardless of pass/fail
		if (cacheEnabled && gitContext) {
			const filesForCache = buildFilesForCache(scopedFiles, checkedFiles, cachedFiles);
			const cachePath = stepCachePath(DEFAULT_CACHE_ROOT, gitContext, name);
			await saveStepCache(cachePath, gitContext, filesForCache, allViolations);
		}

		if (status === "fail" && !passMode) {
			printViolations(allViolations);
			console.log(fail(`\n${allViolations.length} violations found. Fix Step ${step} before continuing.`));
			failedStep = step;
			break;
		}
	}

	const totalViolations = stepResults.reduce((sum, s) => sum + s.violations.length, 0);
	const passed = totalViolations === 0;
	const hasJsonReport = reportPaths.some(p => p.endsWith(".json"));

	if (passMode && !hasJsonReport) {
		// Audit mode \u2014 show full summary only if NOT dumping to JSON
		printPassSummary(stepResults);
	}

	// Write report files if requested
	for (const reportPath of reportPaths) {
		const result = {
			timestamp: new Date().toISOString(),
			mode: passMode ? "audit" : "normal",
			passed,
			stepsRun: stepResults.length,
			stepsTotal: STEPS.length,
			failedStep,
			totalViolations,
			steps: stepResults,
		};
		writeReport(reportPath, result);
	}

	// Exit normally (0) if generating a JSON report, so it doesn't crash CI pipelines
	process.exit(hasJsonReport ? 0 : (passed ? 0 : 1));
}

// Top-level await
try {
	await runChecks();
} catch (err) {
	console.error(fail("❌ Error running checks:"), err);
	process.exit(1);
}
