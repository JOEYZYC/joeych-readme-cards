import { assertWorkflowStructure } from "./workflow-yaml-structure.mjs";

function indentation(line) {
  return line.match(/^ */)[0].length;
}

function parseKeyValue(text) {
  const match = text.match(/^(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([A-Za-z0-9_-]+))[\t ]*:(?:[\t ]+(.*))?$/);
  if (!match) return null;
  let key = match[3];
  if (match[1] !== undefined) {
    try {
      key = JSON.parse(`"${match[1]}"`);
    } catch {
      throw new Error(`Invalid double-quoted YAML key: ${match[1]}`);
    }
  } else if (match[2] !== undefined) {
    key = match[2].replace(/''/g, "'");
  }
  return { key, value: match[4] ?? "" };
}

function keyValue(line, indent) {
  if (!line.startsWith(" ".repeat(indent)) || line[indent] === " ") return null;
  return parseKeyValue(line.slice(indent));
}

function mapping(lines, indent) {
  const result = new Map();
  for (const line of lines) {
    if (!line.trim() || indentation(line) !== indent) continue;
    if (line.slice(indent).startsWith("#")) continue;
    const entry = keyValue(line, indent);
    if (!entry) throw new Error(`Invalid YAML mapping entry at indentation ${indent}: ${line.trim()}`);
    if (result.has(entry.key)) throw new Error(`Duplicate YAML key: ${entry.key}`);
    result.set(entry.key, entry.value);
  }
  return result;
}

function childBlock(lines, key, indent) {
  const start = lines.findIndex((line) => keyValue(line, indent)?.key === key);
  if (start < 0) return [];
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].trim() && indentation(lines[index]) <= indent) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

function parseSteps(jobLines) {
  const stepLines = childBlock(jobLines, "steps", 4);
  const starts = [];
  for (let index = 0; index < stepLines.length; index += 1) {
    const match = stepLines[index].match(/^ {6}-(?: (.*))?$/);
    if (match) starts.push({ index, entry: match[1] ?? "" });
  }
  return starts.map(({ index, entry }, position) => {
    const lines = stepLines.slice(index + 1, starts[position + 1]?.index ?? stepLines.length);
    const properties = mapping(lines, 8);
    const inline = parseKeyValue(entry);
    const name = inline?.key === "name" ? inline.value : null;
    if (inline && inline.key !== "name") properties.set(inline.key, inline.value);
    if (!inline) properties.set("__invalid__", entry);
    const nested = (key) => mapping(childBlock(lines, key, 8), 10);
    let run = properties.get("run") ?? "";
    if (run === "|") {
      const runLines = childBlock(lines, "run", 8);
      run = runLines.map((line) => line.slice(10)).join("\n");
    }
    return { name, properties, with: nested("with"), env: nested("env"), run };
  });
}

export function workflowSteps(source) {
  assertWorkflowStructure(source);
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const jobLines = childBlock(childBlock(lines, "jobs", 0), "publish", 2);
  return new Map(parseSteps(jobLines).map((step) => [step.name, step]));
}

function sameMembers(actual, expected) {
  return actual.length === expected.length && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}

function parseAllowedPaths(run) {
  const match = run.match(/allowed_paths=\(\n([\s\S]*?)\n\)/);
  if (!match) return [];
  return match[1].split("\n").map((line) => line.trim()).filter(Boolean).map((line) => line.replace(/^"|"$/g, ""));
}

function requireValue(errors, condition, message) {
  if (!condition) errors.push(message);
}

function normalizeRun(run) {
  return run.replace(/\r\n/g, "\n").split("\n").map((line) => line.replace(/[\t ]+$/u, "")).join("\n").replace(/\n+$/u, "");
}

function expectedStageRun(paths) {
  return [
    "set -euo pipefail",
    "allowed_paths=(",
    ...paths.map((path) => `  "${path}"`),
    ")",
    "",
    "path_is_allowed() {",
    '  local candidate="$1"',
    "  local allowed",
    '  for allowed in "${allowed_paths[@]}"; do',
    '    if [ "$candidate" = "$allowed" ]; then',
    "      return 0",
    "    fi",
    "  done",
    "  return 1",
    "}",
    "",
    "invalid_path=0",
    "while IFS= read -r -d '' path; do",
    '  if ! path_is_allowed "$path"; then',
    "    printf 'Refusing unexpected changed path: %q\\n' \"$path\" >&2",
    "    invalid_path=1",
    "  fi",
    "done < <(",
    "  {",
    "    git diff --name-only --no-renames -z HEAD --",
    "    git ls-files --others --exclude-standard -z --",
    "  } | sort -zu",
    ")",
    'if [ "$invalid_path" -ne 0 ]; then',
    "  exit 1",
    "fi",
    "",
    'for path in "${allowed_paths[@]}"; do',
    '  if [ ! -f "$path" ] || [ -L "$path" ]; then',
    "    printf 'Refusing missing or symlinked generated path: %q\\n' \"$path\" >&2",
    "    exit 1",
    "  fi",
    "done",
    "",
    'git add -- "${allowed_paths[@]}"',
  ].join("\n");
}

export function workflowContractErrors(source, svgFilenames) {
  assertWorkflowStructure(source);
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const errors = [];
  const root = mapping(lines, 0);
  const onLines = childBlock(lines, "on", 0);
  const triggers = mapping(onLines, 2);
  const concurrency = mapping(childBlock(lines, "concurrency", 0), 2);
  const jobs = mapping(childBlock(lines, "jobs", 0), 2);
  const jobLines = childBlock(childBlock(lines, "jobs", 0), "publish", 2);
  const job = mapping(jobLines, 4);
  const permissions = mapping(childBlock(jobLines, "permissions", 4), 6);
  const steps = parseSteps(jobLines);
  const byName = new Map(steps.map((step) => [step.name, step]));
  const expectedSteps = [
    "Checkout trusted main", "Setup Node", "Install dependencies", "Require trusted main ref",
    "Refresh generated assets", "Run tests", "Scan runtime identity", "Check diff formatting",
    "Guard and stage generated files", "Detect staged changes", "Commit generated assets", "Push generated assets",
  ];
  const expectedPaths = ["data/github-stats.json", "preview/index.html", ...[...svgFilenames].sort().map((name) => `preview/svgs/${name}`)];
  const expectedStepProperties = new Map([
    ["Checkout trusted main", ["uses", "with"]],
    ["Setup Node", ["uses", "with"]],
    ["Install dependencies", ["run"]],
    ["Require trusted main ref", ["run"]],
    ["Refresh generated assets", ["env", "run"]],
    ["Run tests", ["run"]],
    ["Scan runtime identity", ["run"]],
    ["Check diff formatting", ["run"]],
    ["Guard and stage generated files", ["run"]],
    ["Detect staged changes", ["id", "run"]],
    ["Commit generated assets", ["if", "run"]],
    ["Push generated assets", ["if", "run"]],
  ]);
  const expectedRuns = new Map([
    ["Install dependencies", "npm ci"],
    ["Require trusted main ref", 'if [ "$GITHUB_REF" != "refs/heads/main" ]; then\n  echo "Refusing to refresh outside refs/heads/main" >&2\n  exit 1\nfi'],
    ["Refresh generated assets", "npm run refresh"],
    ["Run tests", "npm test"],
    ["Scan runtime identity", "npm run scan:identity"],
    ["Check diff formatting", "npm run check:diff"],
    ["Guard and stage generated files", expectedStageRun(expectedPaths)],
    ["Detect staged changes", 'if git diff --cached --quiet; then\n  echo "changed=false" >> "$GITHUB_OUTPUT"\nelse\n  echo "changed=true" >> "$GITHUB_OUTPUT"\nfi'],
    ["Commit generated assets", 'git config user.name "github-actions[bot]"\ngit config user.email "41898282+github-actions[bot]@users.noreply.github.com"\ngit commit -m "chore(profile): refresh generated SVG snapshots"'],
    ["Push generated assets", "git push origin HEAD:main"],
  ]);

  requireValue(errors, sameMembers([...root.keys()], ["name", "on", "concurrency", "jobs"]), "unexpected root keys");
  requireValue(errors, sameMembers([...triggers.keys()], ["schedule", "workflow_dispatch"]), "unexpected workflow triggers");
  requireValue(errors, triggers.get("schedule") === "", "schedule must be a mapping");
  requireValue(errors, triggers.get("workflow_dispatch") === "", "workflow_dispatch must be empty");
  const scheduleLines = childBlock(onLines, "schedule", 2).filter((line) => line.trim());
  requireValue(errors, scheduleLines.length === 1 && scheduleLines[0] === '    - cron: "0 1 * * 0,3"', "schedule must contain only the exact cron scalar");
  requireValue(errors, childBlock(onLines, "workflow_dispatch", 2).every((line) => !line.trim()), "workflow_dispatch inputs are forbidden");
  requireValue(errors, sameMembers([...concurrency.keys()], ["group", "cancel-in-progress"]), "unexpected concurrency keys");
  requireValue(errors, concurrency.get("group") === "refresh-profile-svgs-main", "wrong concurrency group");
  requireValue(errors, concurrency.get("cancel-in-progress") === "false", "publisher cancellation must be disabled");
  requireValue(errors, root.has("permissions") === false, "workflow-level permissions are forbidden");
  requireValue(errors, sameMembers([...jobs.keys()], ["publish"]), "only the publish job is allowed");
  requireValue(errors, sameMembers([...permissions.keys()], ["contents"]) && permissions.get("contents") === "write", "publish job requires only contents write");
  requireValue(errors, sameMembers([...job.keys()], ["permissions", "runs-on", "timeout-minutes", "steps"]), "unexpected publish job keys");
  requireValue(errors, job.get("runs-on") === "ubuntu-latest", "wrong runner");
  requireValue(errors, job.get("timeout-minutes") === "20", "publish timeout must be exactly 20 minutes");
  requireValue(errors, steps.length === expectedSteps.length && steps.every((step, index) => step.name === expectedSteps[index]), "wrong command or validation order");
  for (const step of steps) {
    requireValue(errors, sameMembers([...step.properties.keys()], expectedStepProperties.get(step.name) ?? []), `unexpected properties on step ${step.name}`);
    requireValue(errors, Boolean(step.name) && Number(step.properties.has("run")) + Number(step.properties.has("uses")) === 1, `invalid step mode for ${step.name ?? "unnamed step"}`);
    if (expectedRuns.has(step.name)) requireValue(errors, normalizeRun(step.run) === normalizeRun(expectedRuns.get(step.name)), `wrong run block for ${step.name}`);
  }

  const checkout = byName.get("Checkout trusted main");
  requireValue(errors, checkout?.properties.get("uses") === "actions/checkout@v7", "wrong checkout tag");
  requireValue(errors, sameMembers([...(checkout?.with.keys() ?? [])], ["ref"]) && checkout?.with.get("ref") === "main", "checkout must contain only ref main");
  const setup = byName.get("Setup Node");
  requireValue(errors, setup?.properties.get("uses") === "actions/setup-node@v7", "wrong setup-node tag");
  requireValue(errors, sameMembers([...(setup?.with.keys() ?? [])], ["node-version", "cache"]), "unexpected setup-node inputs");
  requireValue(errors, setup?.with.get("node-version") === '"24.19.0"' && setup?.with.get("cache") === "npm", "wrong Node or cache configuration");

  const refresh = byName.get("Refresh generated assets");
  requireValue(errors, sameMembers([...(refresh?.env.keys() ?? [])], ["GITHUB_TOKEN"]) && refresh?.env.get("GITHUB_TOKEN") === "${{ github.token }}", "refresh token scope is wrong");
  requireValue(errors, steps.filter((step) => step.env.has("GITHUB_TOKEN")).length === 1, "GITHUB_TOKEN must only reach refresh");

  const stage = byName.get("Guard and stage generated files")?.run ?? "";
  requireValue(errors, sameMembers(parseAllowedPaths(stage), expectedPaths), "generated allowlist is not exact");

  const noOp = byName.get("Detect staged changes");
  requireValue(errors, noOp?.properties.get("id") === "changes", "staged-change step id is wrong");
  const commit = byName.get("Commit generated assets");
  requireValue(errors, commit?.properties.get("if") === "steps.changes.outputs.changed == 'true'", "commit must be conditional");
  const push = byName.get("Push generated assets");
  requireValue(errors, push?.properties.get("if") === "steps.changes.outputs.changed == 'true'", "push must be conditional");

  const forbidden = [/pull_request(?:_target)?:/, /workflow_run:/, /repository_dispatch:/, /^\s*continue-on-error:/m, /^\s*shell:/m, /\$\{\{\s*secrets\./i, /git add\s+(?:\.|-A|--all)(?:\s|$)/, /git push[^\n]*(?:--force|-f\b)/, /git (?:pull|rebase)\b/, /\bPAT\b/i];
  for (const pattern of forbidden) requireValue(errors, !pattern.test(source), `forbidden pattern ${pattern}`);
  requireValue(errors, (source.match(/\bgit push\b/g) ?? []).length === 1, "workflow must contain exactly one push");
  return errors;
}

export function assertWorkflowContract(source, svgFilenames) {
  let errors;
  try {
    errors = workflowContractErrors(source, svgFilenames);
  } catch (error) {
    throw new Error(`Workflow contract violations:\n- ${error.message}`, { cause: error });
  }
  if (errors.length) throw new Error(`Workflow contract violations:\n- ${errors.join("\n- ")}`);
}
