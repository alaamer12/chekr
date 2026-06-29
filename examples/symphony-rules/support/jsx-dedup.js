/**
 * JSX / React tree duplication detection (structure + style + attrs).
 * Ported from scripts/dedup.js — single source of truth for compareBlocks.
 */

// §0  WEIGHT CONSTANTS
// ════════════════════════════════════════════════════════════════════════════
export const W_STRUCTURE = 0.5;
export const W_STYLE = 0.3;
export const W_ATTR = 0.15;
export const W_TEXT = 0.05;
export const STYLE_MIN_CONFIDENCE = 0.4;
export const DUP_THRESHOLD = 0.5;
export const LCS_MAX_LEN = 800;

// ════════════════════════════════════════════════════════════════════════════
// §2  DEFAULT CONFIG
// ════════════════════════════════════════════════════════════════════════════
export const DEFAULT_CONFIG = {
	styleAs: "S",
	level: 2,
	matchMode: "key-and-value",
	normalizeWhitespace: true,
	normalizeCase: true,
	normalizeIdentifiers: true,
	styleSimilarityEnabled: true,
	threshold: DUP_THRESHOLD,
};

// ════════════════════════════════════════════════════════════════════════════
// §3  PARSER
// ════════════════════════════════════════════════════════════════════════════

// §3.1  Pre-processing
export function preprocess(src) {
	return src
		.replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX comments
		.replace(/<!--[\s\S]*?-->/g, "") // HTML comments
		.replace(/\{['"`]\s*['"`]\}/g, "") // whitespace JSX exprs
		.replace(/\{\s*\\n\s*\}/g, "");
}

// §3.2  Tokenizer
export function tokenize(src) {
	const tokens = [];
	let i = 0;
	while (i < src.length) {
		if (src[i] === "<") {
			const isClose = src[i + 1] === "/";
			const isFragment = src[i + 1] === ">";
			if (isFragment) {
				tokens.push({ type: "OPEN_TAG", raw: "<fragment>" });
				i += 2;
				continue;
			}
			if (src.slice(i, i + 3) === "</>") {
				tokens.push({ type: "CLOSE_TAG", raw: "</fragment>" });
				i += 3;
				continue;
			}
			// scan to end of tag using brace+string depth
			let j = i + 1;
			let braceDepth = 0,
				inString = false,
				strChar = "";
			let prev = "";
			while (j < src.length) {
				const ch = src[j];
				if (inString) {
					if (ch === strChar && prev !== "\\") inString = false;
				} else {
					if (ch === '"' || ch === "'" || ch === "`") {
						inString = true;
						strChar = ch;
					} else if (ch === "{") braceDepth++;
					else if (ch === "}") braceDepth--;
					else if (ch === ">" && braceDepth === 0) {
						j++;
						break;
					}
				}
				prev = ch;
				j++;
			}
			const raw = src.slice(i, j);
			if (isClose) tokens.push({ type: "CLOSE_TAG", raw });
			else if (raw.trimEnd().endsWith("/>")) tokens.push({ type: "SELF_CLOSE", raw });
			else tokens.push({ type: "OPEN_TAG", raw });
			i = j;
		} else {
			let j = i;
			while (j < src.length && src[j] !== "<") j++;
			const text = src.slice(i, j);
			if (text.trim()) tokens.push({ type: "TEXT", raw: text });
			i = j;
		}
	}
	return tokens;
}

// §3.3  Attribute parsing
export function parseAttrs(attrStr) {
	const attrs = [];
	let i = 0,
		cur = "",
		state = "NORMAL",
		braceDepth = 0;
	const flush = () => {
		const s = cur.trim();
		if (s) attrs.push(s);
		cur = "";
	};
	while (i < attrStr.length) {
		const ch = attrStr[i];
		switch (state) {
			case "NORMAL":
				if (ch === '"') {
					cur += ch;
					state = "IN_DOUBLE";
				} else if (ch === "'") {
					cur += ch;
					state = "IN_SINGLE";
				} else if (ch === "`") {
					cur += ch;
					state = "IN_TMPL";
				} else if (ch === "{") {
					cur += ch;
					state = "IN_BRACE";
					braceDepth = 1;
				} else if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") flush();
				else cur += ch;
				break;
			case "IN_DOUBLE":
				cur += ch;
				if (ch === '"' && attrStr[i - 1] !== "\\") state = "NORMAL";
				break;
			case "IN_SINGLE":
				cur += ch;
				if (ch === "'" && attrStr[i - 1] !== "\\") state = "NORMAL";
				break;
			case "IN_TMPL":
				cur += ch;
				if (ch === "`") state = "NORMAL";
				break;
			case "IN_BRACE":
				cur += ch;
				if (ch === "{") braceDepth++;
				else if (ch === "}") {
					braceDepth--;
					if (braceDepth === 0) state = "NORMAL";
				}
				break;
		}
		i++;
	}
	flush();
	return attrs.map(a => {
		const eq = a.indexOf("=");
		if (eq === -1) return { key: a, value: null };
		const key = a.slice(0, eq);
		let val = a.slice(eq + 1);
		// strip outer quotes
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
			val = val.slice(1, -1);
		return { key, value: val };
	});
}

// §3.4  Routing
export function routeAttr(key, value, styleAs) {
	if (key === "style" && styleAs.includes("S")) return "style";
	if (key === "className" && styleAs.includes("CS")) return "style";
	if (key === "class" && styleAs.includes("C")) return "style";
	return "attr";
}

export function parseInlineStyle(value) {
	// strip outer {{ }} or { }
	const inner = value.replace(/^\{+\s*/, "").replace(/\s*\}+$/, "");
	const entries = [];
	for (const part of inner.split(",")) {
		const colon = part.indexOf(":");
		if (colon === -1) continue;
		const k = part.slice(0, colon).trim().replace(/['"]/g, "");
		const v = part
			.slice(colon + 1)
			.trim()
			.replace(/['"]/g, "")
			.replace(/[;,}]/g, "");
		if (k) entries.push({ source: "S", key: k, value: v });
	}
	return entries;
}

export function parseClassNames(value, source) {
	return value
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map(cls => ({ source, key: cls, value: null }));
}

// §3.5  Parse a tag token → RawNode
export function parseTag(raw, styleAs) {
	// strip < and >
	const inner = raw.replace(/^<\/?/, "").replace(/\s*\/?>$/, "");
	const spaceIdx = inner.search(/\s/);
	const tag = spaceIdx === -1 ? inner : inner.slice(0, spaceIdx);
	const attrStr = spaceIdx === -1 ? "" : inner.slice(spaceIdx + 1);

	const rawAttrs = parseAttrs(attrStr);
	const styles = [],
		attrs = [];

	for (const { key, value } of rawAttrs) {
		const dest = routeAttr(key, value, styleAs);
		if (dest === "style") {
			if (key === "style") styles.push(...parseInlineStyle(value || ""));
			else if (key === "className") styles.push(...parseClassNames(value || "", "CS"));
			else if (key === "class") styles.push(...parseClassNames(value || "", "C"));
		} else {
			attrs.push({ key, value });
		}
	}

	styles.sort((a, b) => a.key.localeCompare(b.key));
	attrs.sort((a, b) => a.key.localeCompare(b.key));

	return { tag, styles, attrs, text: [], children: [], selfClose: false, rawLines: raw };
}

// §3.7  HOC unwrapping
const KNOWN_WRAPPERS = new Set([
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

export function extractFirstArg(text, openIdx) {
	let depth = 0,
		i = openIdx;
	while (i < text.length) {
		if (text[i] === "(") depth++;
		else if (text[i] === ")") {
			depth--;
			if (depth === 0) return text.slice(openIdx + 1, i);
		}
		i++;
	}
	return null;
}

export function peelWrappers(text) {
	const match = text.match(/^(\w+)\s*\(/);
	if (match && KNOWN_WRAPPERS.has(match[1])) {
		const openIdx = text.indexOf("(");
		const inner = extractFirstArg(text, openIdx);
		if (inner == null) return null;
		const result = peelWrappers(inner.trim());
		return result ?? inner.trim();
	}
	if (text.includes("=>") || text.includes("function")) return text;
	return null;
}

export function preprocessHOC(src) {
	const assignMatch = src.match(/^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*([\s\S]+)/);
	if (!assignMatch) return src;
	const rhs = assignMatch[1].trim();
	const firstWord = rhs.match(/^(\w+)/);
	if (!firstWord || !KNOWN_WRAPPERS.has(firstWord[1])) return src;
	const peeled = peelWrappers(rhs);
	if (!peeled) return src;
	// extract JSX from the callback body
	return peeled.replace(/^[\s\S]*?=>\s*/, "").replace(/^function[^{]*\{([\s\S]*)\}\s*$/, "$1");
}

// §3.6  Build tree
export function buildTree(src, styleAs) {
	src = preprocess(preprocessHOC(src));
	const tokens = tokenize(src);
	const root = { tag: "root", styles: [], attrs: [], text: [], children: [], selfClose: false, rawLines: "" };
	const stack = [root];

	for (const tok of tokens) {
		const top = stack[stack.length - 1];
		if (tok.type === "OPEN_TAG") {
			const node = parseTag(tok.raw, styleAs);
			top.children.push(node);
			stack.push(node);
		} else if (tok.type === "CLOSE_TAG") {
			// find matching tag and pop up to it
			const tagName = tok.raw
				.replace(/<\/\s*/, "")
				.replace(/\s*>$/, "")
				.toLowerCase();
			for (let i = stack.length - 1; i > 0; i--) {
				if (stack[i].tag.toLowerCase() === tagName) {
					stack.splice(i);
					break;
				}
			}
		} else if (tok.type === "SELF_CLOSE") {
			const node = parseTag(tok.raw, styleAs);
			node.selfClose = true;
			top.children.push(node);
		} else if (tok.type === "TEXT") {
			const t = tok.raw.trim();
			if (t) top.text.push(t);
		}
	}
	return root;
}

// ════════════════════════════════════════════════════════════════════════════
// §4  NORMALIZATION
// ════════════════════════════════════════════════════════════════════════════
export function normalizeValue(v, opts) {
	if (v == null) return null;
	if (opts.identifiers) v = v.replace(/\{[^}]*\}/g, "{EXPR}");
	if (opts.whitespace) v = v.replace(/\s+/g, " ").trim();
	if (opts.case) v = v.toLowerCase();
	return v;
}

export function normalizeKey(k, opts, isAttr = false) {
	if (opts.whitespace) k = k.trim();
	if (isAttr && opts.identifiers) {
		if (/^on[A-Z]/.test(k)) return "HANDLER";
		if (k === "className" || k === "class") return "CLASS";
	}
	if (opts.case) k = k.toLowerCase();
	return k;
}

export function normalizeNode(node, opts) {
	let tag = node.tag;
	if (opts.case) tag = tag.toLowerCase();
	const styles = node.styles.map(s => ({
		...s,
		key: normalizeKey(s.key, opts),
		value: normalizeValue(s.value, opts),
	}));
	const attrs = node.attrs.map(a => ({
		key: normalizeKey(a.key, opts, true),
		value: normalizeValue(a.value, opts),
	}));
	const text = node.text
		.map(t => {
			if (opts.identifiers) t = t.replace(/\{[^}]*\}/g, "{EXPR}");
			if (opts.whitespace) t = t.replace(/\s+/g, " ").trim();
			if (opts.case) t = t.toLowerCase();
			return t;
		})
		.filter(Boolean);
	return {
		...node,
		tag,
		styles,
		attrs,
		text,
		children: node.children.map(c => normalizeNode(c, opts)),
	};
}

// ════════════════════════════════════════════════════════════════════════════
// §5  SERIALIZATION
// ════════════════════════════════════════════════════════════════════════════
export function buildStyleToken(styles, matchMode) {
	if (!styles.length) return "";
	let out = "";
	for (const s of styles) {
		if (s.source === "S") {
			if (matchMode === "key-only") out += `[${s.key}]`;
			else if (matchMode === "value-only") out += s.value ? `[${s.value}]` : "";
			else out += `[${s.key}:${s.value ?? ""}]`;
		} else {
			// CS / C  — key-only dot notation
			if (matchMode === "value-only") {
				/* no value, skip */
			} else out += `.${s.key}`;
		}
	}
	return out;
}

export function buildAttrToken(attrs, matchMode) {
	if (!attrs.length) return "";
	return attrs
		.map(a => {
			if (matchMode === "key-only") return `(${a.key})`;
			if (matchMode === "value-only") return a.value != null ? `(${a.value})` : "";
			return a.value != null ? `(${a.key}=${a.value})` : `(${a.key})`;
		})
		.filter(Boolean)
		.join("");
}

export function escapeText(t) {
	return t.replace(/'/g, "\\'");
}

export function buildToken(node, level, matchMode) {
	let tok = node.tag;
	if (level >= 1) tok += buildStyleToken(node.styles, matchMode);
	if (level >= 2) tok += buildAttrToken(node.attrs, matchMode);
	return tok;
}

export function serializeNode(node, level, matchMode, depth = 0) {
	if (depth > 50) return node.tag + " > …";
	const token = buildToken(node, level, matchMode);
	const childSigs = node.children.map(c => serializeNode(c, level, matchMode, depth + 1));
	const textSigs = level === 3 ? node.text.map(t => `'${escapeText(t)}'`) : [];
	const all = [...childSigs, ...textSigs];
	return all.length ? `${token} > ${all.join(" + ")}` : token;
}

export function serializeBlock(root, level, matchMode) {
	return root.children.map(c => serializeNode(c, level, matchMode)).join(" + ");
}

// ════════════════════════════════════════════════════════════════════════════
// §9  LCS / SUBSTRING
// ════════════════════════════════════════════════════════════════════════════
export function downsample(s, maxLen) {
	if (s.length <= maxLen) return s;
	const N = Math.ceil(s.length / maxLen);
	let out = "";
	for (let i = 0; i < s.length; i += N) out += s[i];
	return out;
}

export function lcsLength(a, b) {
	a = downsample(a, LCS_MAX_LEN);
	b = downsample(b, LCS_MAX_LEN);
	const m = a.length,
		n = b.length;
	let prevRow = new Uint16Array(n + 1);
	let currRow = new Uint16Array(n + 1);
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (a[i - 1] === b[j - 1]) {
				currRow[j] = prevRow[j - 1] + 1;
			} else {
				currRow[j] = Math.max(prevRow[j], currRow[j - 1]);
			}
		}
		// Swap rows
		const temp = prevRow;
		prevRow = currRow;
		currRow = temp;
		currRow.fill(0);
	}
	return prevRow[n];
}

export function lcs_sim(a, b) {
	if (!a && !b) return 1;
	const len = lcsLength(a, b);
	return (2 * len) / (a.length + b.length);
}

export function longestCommonSubstring(a, b) {
	const cap = Math.min(a.length, b.length, 1200);
	a = a.slice(0, cap);
	b = b.slice(0, cap);
	const m = a.length,
		n = b.length;
	let best = 0,
		end = 0;
	let prevRow = new Uint16Array(n + 1);
	let currRow = new Uint16Array(n + 1);
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (a[i - 1] === b[j - 1]) {
				currRow[j] = prevRow[j - 1] + 1;
				if (currRow[j] > best) {
					best = currRow[j];
					end = i;
				}
			} else {
				currRow[j] = 0;
			}
		}
		// Swap rows
		const temp = prevRow;
		prevRow = currRow;
		currRow = temp;
		currRow.fill(0);
	}
	return { length: best, substring: a.slice(end - best, end) };
}

export function lcsub_sim(a, b) {
	if (!a && !b) return { score: 1, shared: "" };
	const { length, substring } = longestCommonSubstring(a, b);
	return { score: (2 * length) / (a.length + b.length), shared: substring };
}

// §9.3  Attr / text similarity
export function attrSim(attrsA, attrsB) {
	if (!attrsA.length && !attrsB.length) return 0;
	const setA = new Set(attrsA.map(a => `${a.key}=${a.value}`));
	const setB = new Set(attrsB.map(a => `${a.key}=${a.value}`));
	let inter = 0;
	for (const v of setA) if (setB.has(v)) inter++;
	return inter / Math.max(setA.size, setB.size);
}

export function textSim(textA, textB) {
	return lcs_sim(textA.join(" "), textB.join(" "));
}

// ════════════════════════════════════════════════════════════════════════════
// §6  STYLE SIMILARITY
// ════════════════════════════════════════════════════════════════════════════
export function compareStyleGroup(entriesA, entriesB) {
	if (!entriesA.length && !entriesB.length) return 1;
	const setA = new Set(entriesA.map(e => (e.value != null ? `${e.key}:${e.value}` : e.key)));
	const setB = new Set(entriesB.map(e => (e.value != null ? `${e.key}:${e.value}` : e.key)));
	let inter = 0;
	for (const v of setA) if (setB.has(v)) inter++;
	return inter / Math.max(setA.size, setB.size);
}

export function styleSim(nodeA, nodeB) {
	const groupStyles = styles => {
		const g = { S: [], CS: [], C: [] };
		for (const s of styles) g[s.source].push(s);
		return g;
	};
	const gA = groupStyles(nodeA.styles);
	const gB = groupStyles(nodeB.styles);
	const sources = new Set([...nodeA.styles.map(s => s.source), ...nodeB.styles.map(s => s.source)]);

	if (!sources.size) return { overall: 1.0, bySource: {}, confident: false };

	let totalSize = 0,
		weightedSum = 0;
	const bySource = {};
	for (const src of sources) {
		const size = Math.max(gA[src].length, gB[src].length);
		const sim = compareStyleGroup(gA[src], gB[src]);
		bySource[src] = sim;
		weightedSum += sim * size;
		totalSize += size;
	}
	const overall = totalSize ? weightedSum / totalSize : 1.0;
	return { overall, bySource, confident: overall >= STYLE_MIN_CONFIDENCE };
}

// ════════════════════════════════════════════════════════════════════════════
// §7  SCORING
// ════════════════════════════════════════════════════════════════════════════
export function redistributeWeights(level) {
	const active = { W_STRUCTURE };
	if (level >= 1) active.W_STYLE = W_STYLE;
	if (level >= 2) active.W_ATTR = W_ATTR;
	if (level === 3) active.W_TEXT = W_TEXT;
	const total = Object.values(active).reduce((a, b) => a + b, 0);
	const result = {};
	for (const [k, v] of Object.entries(active)) result[k] = v / total;
	return result;
}

export function subtreeSize(node) {
	return 1 + node.children.reduce((s, c) => s + subtreeSize(c), 0);
}

export function nodeScore(nodeA, nodeB, sigA, sigB, cfg) {
	const wt = redistributeWeights(cfg.level);
	const lcsVal = lcs_sim(sigA, sigB);
	const subSim = lcsub_sim(sigA, sigB);
	const structureScore = Math.max(lcsVal, subSim.score);
	const ss = cfg.styleSimilarityEnabled ? styleSim(nodeA, nodeB) : { overall: 0, bySource: {}, confident: false };
	const styleScore = ss.confident ? ss.overall : 0;
	const aScore = cfg.level >= 2 ? attrSim(nodeA.attrs, nodeB.attrs) : 0;
	const tScore = cfg.level === 3 ? textSim(nodeA.text, nodeB.text) : 0;

	const score =
		(wt.W_STRUCTURE ?? 0) * structureScore +
		(wt.W_STYLE ?? 0) * styleScore +
		(wt.W_ATTR ?? 0) * aScore +
		(wt.W_TEXT ?? 0) * tScore;

	return {
		nodeA,
		nodeB,
		sigA,
		sigB,
		structureScore,
		styleScore: ss,
		attrScore: aScore,
		textScore: tScore,
		nodeScore: score,
		lcs: lcsVal,
		lcsSub: subSim.score,
		sharedSubstring: subSim.shared,
	};
}

// ════════════════════════════════════════════════════════════════════════════
// §8  MATCHER
// ════════════════════════════════════════════════════════════════════════════
export function flattenTree(root) {
	const out = [];
	const visit = n => {
		if (n.tag !== "root") out.push(n);
		n.children.forEach(visit);
	};
	visit(root);
	return out;
}

export function matchNodes(treeA, treeB, cfg) {
	const opts = {
		whitespace: cfg.normalizeWhitespace,
		case: cfg.normalizeCase,
		identifiers: cfg.normalizeIdentifiers,
	};
	const normA = normalizeNode(treeA, opts);
	const normB = normalizeNode(treeB, opts);
	const nodesA = flattenTree(normA);
	const nodesB = flattenTree(normB);

	const sigsA = new Map();
	const sigsB = new Map();
	for (const nA of nodesA) {
		sigsA.set(nA, serializeNode(nA, cfg.level, cfg.matchMode));
	}
	for (const nB of nodesB) {
		sigsB.set(nB, serializeNode(nB, cfg.level, cfg.matchMode));
	}

	const pairs = [];
	for (const nA of nodesA) {
		const sigA = sigsA.get(nA);
		for (const nB of nodesB) {
			const sigB = sigsB.get(nB);
			pairs.push(nodeScore(nA, nB, sigA, sigB, cfg));
		}
	}
	pairs.sort((a, b) => b.nodeScore - a.nodeScore);

	const usedA = new Set(),
		usedB = new Set();
	const matched = [];
	for (const p of pairs) {
		if (usedA.has(p.nodeA) || usedB.has(p.nodeB)) continue;
		if (p.nodeScore < cfg.threshold) continue;
		usedA.add(p.nodeA);
		usedB.add(p.nodeB);
		matched.push(p);
	}
	return { matched, nodesA, nodesB };
}

// §7.2  Global block score
export function compareBlocks(srcA, srcB, userCfg = {}) {
	const cfg = { ...DEFAULT_CONFIG, ...userCfg };
	const treeA = buildTree(srcA, cfg.styleAs);
	const treeB = buildTree(srcB, cfg.styleAs);
	const { matched, nodesA, nodesB } = matchNodes(treeA, treeB, cfg);

	const totalNodes = Math.max(nodesA.length + nodesB.length, 1);
	let sum = 0;
	for (const p of matched) {
		const sA = subtreeSize(p.nodeA);
		const sB = subtreeSize(p.nodeB);
		const hw = sA + sB > 0 ? (2 * sA * sB) / (sA + sB) : 1;
		sum += p.nodeScore * hw;
	}
	const globalScore = sum / totalNodes;
	return {
		globalScore,
		confidence: Math.round(globalScore * 100),
		verdict: globalScore >= cfg.threshold ? "DUP" : "OK",
		nodeMatches: matched,
		config: cfg,
	};
}

// ════════════════════════════════════════════════════════════════════════════
