function indentation(line, lineNumber) {
  const prefix = line.match(/^[\t ]*/u)[0];
  if (prefix.includes("\t")) throw new Error(`YAML indentation uses a tab at line ${lineNumber}`);
  return prefix.length;
}

function structuralEntry(text, lineNumber) {
  const sequence = text.startsWith("- ");
  const entry = sequence ? text.slice(2) : text;
  const match = entry.match(/^(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[A-Za-z0-9_-]+)[\t ]*:(?:[\t ]+(.*))?$/u);
  if (!match) throw new Error(`Unconsumed YAML structure at line ${lineNumber}: ${text}`);
  return { sequence, value: match[1] ?? "" };
}

export function assertWorkflowStructure(source) {
  const lines = source.replace(/\r\n/gu, "\n").split("\n");
  const containers = [0];
  let pendingChildIndent = null;
  let blockScalarIndent = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const lineNumber = index + 1;
    const indent = indentation(line, lineNumber);
    if (blockScalarIndent !== null && indent > blockScalarIndent) continue;
    blockScalarIndent = null;

    if (pendingChildIndent === indent) {
      containers.push(indent);
    }
    pendingChildIndent = null;
    while (containers.at(-1) > indent) containers.pop();
    if (containers.at(-1) !== indent) {
      throw new Error(`Unexpected YAML indentation ${indent} at line ${lineNumber}: ${line.trim()}`);
    }

    const entry = structuralEntry(line.slice(indent), lineNumber);
    if (entry.value === "|") blockScalarIndent = indent;
    else if (entry.sequence || entry.value === "") pendingChildIndent = indent + 2;
  }
}
