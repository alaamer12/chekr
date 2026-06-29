/**
 * Shared React component detection and LOC counting utilities.
 * Used by scripts/react-loc-counter.js and check-react-srp.js.
 */

/** Default LOC counting options (matches react-loc-counter CLI script). */
export const DEFAULT_LOC_CONFIG = {
	count_empty_lines: false,
	count_comment_lines: true,
	count_block_comment_lines: true,
	min_lines: 2,
};

/** Known HOC wrappers that take a render callback as their argument. */
export const HOC_WRAPPERS = new Set([
	"memo",
	"forwardRef",
	"lazy",
	"observer",
	"connect",
	"inject",
	"withRouter",
	"withTheme",
	"styled",
	"withStyles",
	"withTranslation",
]);

/** PascalCase name */
export function isPascalCase(name) {
	return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

/** Line array contains JSX or React.createElement */
export function hasJSX(lines) {
	return lines.some(
		l =>
			/<\/?[A-Z][A-Za-z0-9.]*[\s/>]/.test(l) ||
			/<[a-z][a-z0-9-]*[\s/>]/.test(l) ||
			/<>|<\/>/.test(l) ||
			/React\.createElement/.test(l)
	);
}

/**
 * Given source lines and the index of the header line, extract all lines
 * belonging to the function body.
 */
export function extractBody(lines, startLineIdx) {
	const body = [];
	let braceDepth = 0;
	let parenDepth = 0;
	let braceOpened = false;
	let parenOpened = false;
	let inString = false;
	let strChar = "";

	for (let i = startLineIdx; i < lines.length; i++) {
		const line = lines[i];
		body.push(line);

		for (let ci = 0; ci < line.length; ci++) {
			const ch = line[ci];
			const prev = ci > 0 ? line[ci - 1] : "";

			if (inString) {
				if (ch === strChar && prev !== "\\") inString = false;
				continue;
			}
			if (ch === '"' || ch === "'" || ch === "`") {
				inString = true;
				strChar = ch;
				continue;
			}
			if (ch === "/" && line[ci + 1] === "/") break;

			if (ch === "{") {
				braceDepth++;
				braceOpened = true;
			}
			if (ch === "}") {
				braceDepth--;
			}
			if (ch === "(") {
				parenDepth++;
				parenOpened = true;
			}
			if (ch === ")") {
				parenDepth--;
			}
		}

		if (braceOpened && braceDepth === 0) break;
		if (parenOpened && !braceOpened && parenDepth === 0) break;
		if (!braceOpened && !parenOpened && i > startLineIdx) break;
	}

	return body;
}

function extractFirstArg(text, openIdx) {
	let depth = 0;
	let start = -1;
	for (let i = openIdx; i < text.length; i++) {
		if (text[i] === "(") {
			depth++;
			if (depth === 1) start = i + 1;
		} else if (text[i] === ")") {
			depth--;
			if (depth === 0) return text.slice(start, i).trim();
		}
	}
	return null;
}

function peelWrappers(text) {
	const trimmed = text.trim();
	const wrapMatch = trimmed.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
	if (wrapMatch && HOC_WRAPPERS.has(wrapMatch[1])) {
		const inner = extractFirstArg(trimmed, wrapMatch[0].length - 1);
		if (inner !== null) {
			const deeper = peelWrappers(inner);
			return deeper !== null ? deeper : inner;
		}
	}
	if (/=>|\bfunction\b/.test(trimmed)) return trimmed;
	return null;
}

function extractWrappedComponent(lines, startLineIdx, rhsText) {
	const outerBody = extractBody(lines, startLineIdx);
	const innermostCallback = peelWrappers(rhsText);
	if (!innermostCallback) return null;
	const cbLines = innermostCallback.split("\n");
	if (!hasJSX(cbLines)) return null;
	return { outerBody, cbLines };
}

export function countLOC(lines, config = DEFAULT_LOC_CONFIG) {
	let inBlockComment = false;
	let count = 0;

	for (const raw of lines) {
		const line = raw.trim();

		if (inBlockComment) {
			if (config.count_block_comment_lines) count++;
			if (line.includes("*/")) inBlockComment = false;
			continue;
		}

		if (line.startsWith("/*") || line.startsWith("/**")) {
			inBlockComment = true;
			if (config.count_block_comment_lines) count++;
			if (line.includes("*/")) inBlockComment = false;
			continue;
		}

		if (line === "") {
			if (config.count_empty_lines) count++;
			continue;
		}

		if (line.startsWith("//")) {
			if (config.count_comment_lines) count++;
			continue;
		}

		count++;
	}

	return count;
}

/**
 * Scan source lines and return detected React components.
 * @returns {{ name: string, startLine: number, endLine: number, bodyLines: string[], loc: number }[]}
 */
export function detectComponents(lines, config = DEFAULT_LOC_CONFIG) {
	const components = [];
	const used = new Set();

	const addIfReact = (name, headerIdx, bodyLines) => {
		if (!isPascalCase(name)) return;
		if (/^use[A-Z]/.test(name)) return;
		if (!hasJSX(bodyLines)) return;

		const startLine = headerIdx + 1;
		const endLine = startLine + bodyLines.length - 1;
		const rangeKey = `${startLine}-${endLine}`;
		if (used.has(rangeKey)) return;
		used.add(rangeKey);

		const loc = countLOC(bodyLines, config);
		if (loc < config.min_lines) return;

		components.push({ name, startLine, endLine, bodyLines, loc });
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		const funcDecl = line.match(/^(?:export\s+(?:default\s+)?)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[(<]/);
		if (funcDecl) {
			const body = extractBody(lines, i);
			addIfReact(funcDecl[1], i, body);
		}

		const arrowOrExpr = line.match(
			/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::\s*React\.[A-Z][A-Za-z]*(?:<[^>]*>)?\s*)?=/
		);
		if (arrowOrExpr) {
			const name = arrowOrExpr[1];
			const rhsLine = lines[i].replace(/^.*?=\s*/, "").trim();
			const wrapperMatch = rhsLine.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
			if (wrapperMatch && HOC_WRAPPERS.has(wrapperMatch[1])) {
				const outerBodyForRhs = extractBody(lines, i);
				const fullRhs = outerBodyForRhs
					.join("\n")
					.replace(/^[^=]*=\s*/, "")
					.trim();
				const result = extractWrappedComponent(lines, i, fullRhs);
				if (result) {
					const { outerBody } = result;
					const startLine = i + 1;
					const endLine = startLine + outerBody.length - 1;
					const rangeKey = `${startLine}-${endLine}`;
					if (!used.has(rangeKey) && isPascalCase(name) && !/^use[A-Z]/.test(name)) {
						used.add(rangeKey);
						const loc = countLOC(outerBody, config);
						if (loc >= Math.min(config.min_lines, 1)) {
							components.push({ name, startLine, endLine, bodyLines: outerBody, loc });
						}
					}
				}
			} else {
				const body = extractBody(lines, i);
				addIfReact(name, i, body);
			}
		}

		const classComp = line.match(
			/^(?:export\s+(?:default\s+)?)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+extends\s+(?:React\.)?(?:Component|PureComponent)/
		);
		if (classComp) {
			const body = extractBody(lines, i);
			addIfReact(classComp[1], i, body);
		}

		const anonDefault = line.match(/^export\s+default\s+function\s*\(/);
		if (anonDefault) {
			const body = extractBody(lines, i);
			if (hasJSX(body)) {
				const startLine = i + 1;
				const endLine = startLine + body.length - 1;
				const rangeKey = `${startLine}-${endLine}`;
				if (!used.has(rangeKey)) {
					used.add(rangeKey);
					const loc = countLOC(body, config);
					if (loc >= config.min_lines) {
						components.push({ name: "<default>", startLine, endLine, bodyLines: body, loc });
					}
				}
			}
		}

		const nestedFunc = lines[i].match(/^\s+(?:function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[(<])/);
		if (nestedFunc) {
			const body = extractBody(lines, i);
			addIfReact(nestedFunc[1], i, body);
		}
	}

	components.sort((a, b) => a.startLine - b.startLine);
	return components;
}
