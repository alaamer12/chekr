export function checkTodoViolation(source, filePath) {
  const violations = [];
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("TODO")) {
      violations.push({
        file: filePath,
        line: i + 1,
        message: "Found TODO comment",
        text: lines[i].trim(),
      });
    }
  }

  return violations;
}
