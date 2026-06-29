/**
 * @param {object} result
 */
export function reportJson(result) {
  console.log(formatJson(result));
}

/**
 * @param {any} result
 * @returns {string}
 */
export function formatJson(result) {
  const structured = {
    ...result,
    violations: groupViolations(result.violations || []),
  };
  return JSON.stringify(structured, null, 2);
}

/**
 * @param {any[]} violations
 */
function groupViolations(violations) {
  if (!violations.length) return [];

  /** @type {Map<string, any>} */
  const groups = new Map();
  const ungrouped = [];

  for (const v of violations) {
    const groupId = v.logicalId || (v.checkId && v.message ? `${v.checkId}:${v.message}` : null);
    if (!groupId) {
      ungrouped.push(v);
      continue;
    }

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        rule: v.checkId,
        severity: v.severity,
        message: v.message,
        logicalId: v.logicalId,
        metadata: v.data || {},
        impact: v.impact,
        locations: [],
      });
    }

    const group = groups.get(groupId);
    if (v.locations) {
      // Deduplicate locations by file/line
      for (const loc of v.locations) {
        const exists = group.locations.some(
          (l) => l.file === loc.file && l.line === loc.line && l.label === loc.label,
        );
        if (!exists) group.locations.push(loc);
      }
    } else if (v.file) {
      const exists = group.locations.some((l) => l.file === v.file && l.line === v.line);
      if (!exists) {
        group.locations.push({
          file: v.file,
          line: v.line,
          column: v.column,
          text: v.text,
          label: "primary",
        });
      }
    }
  }

  return [...Array.from(groups.values()), ...ungrouped];
}
