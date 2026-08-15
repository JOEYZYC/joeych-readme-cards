import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { expectedSvgFilenames } from "../scripts/generate-preview.mjs";
import { assertWorkflowContract } from "../test-support/workflow-contract.mjs";

const workflowUrl = new URL("../.github/workflows/refresh-profile-svgs.yml", import.meta.url);
const workflow = await readFile(workflowUrl, "utf8");

function replaceRequired(source, before, after) {
  assert.ok(source.includes(before), `missing mutation target: ${before}`);
  return source.replace(before, after);
}

function swapSteps(source, firstName, secondName) {
  const lines = source.split("\n");
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^ {6}- name: (.+)$/);
    if (match) starts.push({ index, name: match[1] });
  }
  const blocks = starts.map(({ index, name }, position) => ({ name, lines: lines.slice(index, starts[position + 1]?.index ?? lines.length) }));
  const first = blocks.findIndex((block) => block.name === firstName);
  const second = blocks.findIndex((block) => block.name === secondName);
  assert.notEqual(first, -1);
  assert.notEqual(second, -1);
  [blocks[first], blocks[second]] = [blocks[second], blocks[first]];
  return [...lines.slice(0, starts[0].index), ...blocks.flatMap((block) => block.lines)].join("\n");
}

test("scheduled publisher satisfies the trusted-main workflow contract", () => {
  assertWorkflowContract(workflow, expectedSvgFilenames);
});

const mutations = [
  ["wrong cron", (source) => replaceRequired(source, 'cron: "0 1 * * 0,3"', 'cron: "5 1 * * 0,3"')],
  ["contents read", (source) => replaceRequired(source, "contents: write", "contents: read")],
  ["cancel in progress", (source) => replaceRequired(source, "cancel-in-progress: false", "cancel-in-progress: true")],
  ["missing trusted ref guard", (source) => replaceRequired(source, 'if [ "$GITHUB_REF" != "refs/heads/main" ]; then', 'if [ -z "$GITHUB_REF" ]; then')],
  ["token at job scope", (source) => replaceRequired(source, "    timeout-minutes: 20", "    timeout-minutes: 20\n    env:\n      GITHUB_TOKEN: ${{ github.token }}")],
  ["tests continue on error", (source) => replaceRequired(source, "      - name: Run tests\n        run: npm test", "      - name: Run tests\n        continue-on-error: true\n        run: npm test")],
  ["path guard continues on error", (source) => replaceRequired(source, "      - name: Guard and stage generated files\n        run: |", "      - name: Guard and stage generated files\n        continue-on-error: true\n        run: |")],
  ["explicit checkout token", (source) => replaceRequired(source, "          ref: main", "          ref: main\n          token: ${{ github.token }}")],
  ["secret checkout token", (source) => replaceRequired(source, "          ref: main", "          ref: main\n          token: ${{ secrets.WRITE_TOKEN }}")],
  ["refresh shell override", (source) => replaceRequired(source, "        run: npm run refresh", "        shell: bash -x\n        run: npm run refresh")],
  ["workflow dispatch expression", (source) => replaceRequired(source, "  workflow_dispatch:", "  workflow_dispatch: ${{ github.ref }}")],
  ["workflow dispatch inputs", (source) => replaceRequired(source, "  workflow_dispatch:", "  workflow_dispatch:\n    inputs:\n      unsafe:\n        required: false")],
  ["timeout drift", (source) => replaceRequired(source, "    timeout-minutes: 20", "    timeout-minutes: 19")],
  ["unexpected step property", (source) => replaceRequired(source, "      - name: Install dependencies\n        run: npm ci", "      - name: Install dependencies\n        working-directory: preview\n        run: npm ci")],
  ["unexpected checkout with key", (source) => replaceRequired(source, "          ref: main", "          ref: main\n          fetch-depth: 0")],
  ["unexpected setup-node with key", (source) => replaceRequired(source, "          cache: npm", "          cache: npm\n          registry-url: https://registry.npmjs.org")],
  ["unnamed run step", (source) => replaceRequired(source, "    steps:\n", "    steps:\n      - run: curl https://example.invalid\n")],
  ["unnamed uses step", (source) => replaceRequired(source, "    steps:\n", "    steps:\n      - uses: actions/checkout@v7\n")],
  ["unrecognized step entry", (source) => replaceRequired(source, "    steps:\n", "    steps:\n      - mystery: value\n")],
  ["multiple-mode checkout step", (source) => replaceRequired(source, "        uses: actions/checkout@v7", "        uses: actions/checkout@v7\n        run: echo unsafe")],
  ["trusted-ref appended curl", (source) => replaceRequired(source, "            exit 1\n          fi", "            exit 1\n          fi\n          curl https://example.invalid")],
  ["path guard appended config dump", (source) => replaceRequired(source, '          git add -- "${allowed_paths[@]}"', '          git add -- "${allowed_paths[@]}"\n          git config --list')],
  ["staged-change output override", (source) => replaceRequired(source, '            echo "changed=true" >> "$GITHUB_OUTPUT"\n          fi', '            echo "changed=true" >> "$GITHUB_OUTPUT"\n          fi\n          printf \'changed=true\\n\' > "$GITHUB_OUTPUT"')],
  ["commit appended curl", (source) => replaceRequired(source, '          git commit -m "chore(profile): refresh generated SVG snapshots"', '          git commit -m "chore(profile): refresh generated SVG snapshots"\n          curl https://example.invalid')],
  ["trusted-ref failure masking", (source) => replaceRequired(source, "            exit 1\n          fi", "            exit 1\n          fi\n          false || true")],
  ["path guard failure masking", (source) => replaceRequired(source, '          git add -- "${allowed_paths[@]}"', '          git add -- "${allowed_paths[@]}"\n          false || true')],
  ["staged-change failure masking", (source) => replaceRequired(source, '            echo "changed=true" >> "$GITHUB_OUTPUT"\n          fi', '            echo "changed=true" >> "$GITHUB_OUTPUT"\n          fi\n          false || true')],
  ["commit failure masking", (source) => replaceRequired(source, '          git commit -m "chore(profile): refresh generated SVG snapshots"', '          git commit -m "chore(profile): refresh generated SVG snapshots"\n          false || true')],
  ["refresh failure masking", (source) => replaceRequired(source, "        run: npm run refresh", "        run: npm run refresh || true")],
  ["tests failure masking", (source) => replaceRequired(source, "        run: npm test", "        run: npm test || true")],
  ["identity scan failure masking", (source) => replaceRequired(source, "        run: npm run scan:identity", "        run: npm run scan:identity || true")],
  ["diff check failure masking", (source) => replaceRequired(source, "        run: npm run check:diff", "        run: npm run check:diff || true")],
  ["push failure masking", (source) => replaceRequired(source, "        run: git push origin HEAD:main", "        run: git push origin HEAD:main || true")],
  ["tests after staging", (source) => swapSteps(source, "Run tests", "Guard and stage generated files")],
  ["broad staging", (source) => replaceRequired(source, 'git add -- "${allowed_paths[@]}"', "git add .")],
  ["force push", (source) => replaceRequired(source, "git push origin HEAD:main", "git push --force origin HEAD:main")],
  ["pull request trigger", (source) => replaceRequired(source, "  workflow_dispatch:", "  workflow_dispatch:\n  pull_request:")],
  ["double-quoted pull request trigger", (source) => replaceRequired(source, "  workflow_dispatch:", "  workflow_dispatch:\n  \"pull_request\":")],
  ["single-quoted workflow run trigger", (source) => replaceRequired(source, "  workflow_dispatch:", "  workflow_dispatch:\n  'workflow_run':")],
  ["quoted continue on error", (source) => replaceRequired(source, "      - name: Run tests\n        run: npm test", "      - name: Run tests\n        \"continue-on-error\": true\n        run: npm test")],
  ["quoted unexpected root key", (source) => `\"permissions\": write\n${source}`],
  ["quoted unexpected job key", (source) => replaceRequired(source, "    timeout-minutes: 20", "    timeout-minutes: 20\n    'environment': production")],
  ["quoted unexpected step key", (source) => replaceRequired(source, "      - name: Run tests\n        run: npm test", "      - name: Run tests\n        'working-directory': preview\n        run: npm test")],
  ["quoted root key shadows allowed key", (source) => replaceRequired(source, "jobs:\n", "jobs:\n\"jobs\":\n")],
  ["quoted job key duplicates allowed key", (source) => replaceRequired(source, "    runs-on: ubuntu-latest", "    runs-on: ubuntu-latest\n    \"runs-on\": windows-latest")],
  ["quoted step key duplicates allowed key", (source) => replaceRequired(source, "      - name: Run tests\n        run: npm test", "      - name: Run tests\n        run: npm test\n        'run': npm test || true")],
  ["escaped quoted key duplicates allowed key", (source) => replaceRequired(source, "      - name: Run tests\n        run: npm test", "      - name: Run tests\n        run: npm test\n        \"\\u0072un\": npm test || true")],
  ["double-quoted pull request trigger with space before colon", (source) => replaceRequired(source, "  workflow_dispatch:", "  workflow_dispatch:\n  \"pull_request\" :")],
  ["single-quoted workflow run trigger with tab before colon", (source) => replaceRequired(source, "  workflow_dispatch:", "  workflow_dispatch:\n  'workflow_run'\t:")],
  ["double-quoted continue on error with space before colon", (source) => replaceRequired(source, "      - name: Run tests\n        run: npm test", "      - name: Run tests\n        \"continue-on-error\" : true\n        run: npm test")],
  ["single-quoted continue on error with tab before colon", (source) => replaceRequired(source, "      - name: Run tests\n        run: npm test", "      - name: Run tests\n        'continue-on-error'\t: true\n        run: npm test")],
  ["escaped pull request trigger with space before colon", (source) => replaceRequired(source, "  workflow_dispatch:", "  workflow_dispatch:\n  \"\\u0070ull_request\" :")],
  ["escaped continue on error with tab before colon", (source) => replaceRequired(source, "      - name: Run tests\n        run: npm test", "      - name: Run tests\n        \"\\u0063ontinue-on-error\"\t: true\n        run: npm test")],
  ["quoted job key with space duplicates allowed key", (source) => replaceRequired(source, "    runs-on: ubuntu-latest", "    runs-on: ubuntu-latest\n    \"runs-on\" : windows-latest")],
  ["escaped quoted step key with tab duplicates allowed key", (source) => replaceRequired(source, "      - name: Run tests\n        run: npm test", "      - name: Run tests\n        run: npm test\n        \"\\u0072un\"\t: npm test || true")],
  ["unterminated quoted trigger key", (source) => replaceRequired(source, "  workflow_dispatch:", "  workflow_dispatch:\n  \"pull_request :")],
  ["ambiguous quoted step key suffix", (source) => replaceRequired(source, "      - name: Run tests\n        run: npm test", "      - name: Run tests\n        \"continue-on-error\" unsafe: true\n        run: npm test")],
  ["misindented root child", (source) => replaceRequired(source, "name: Refresh profile SVGs", "name: Refresh profile SVGs\n name: shadow")],
  ["misindented publish job property", (source) => replaceRequired(source, "    runs-on: ubuntu-latest", "    runs-on: ubuntu-latest\n     runs-on: windows-latest")],
  ["misindented steps sequence", (source) => replaceRequired(source, "    steps:\n      - name: Checkout trusted main", "    steps:\n       - name: Hidden step\n      - name: Checkout trusted main")],
  ["misindented checkout with input", (source) => replaceRequired(source, "          ref: main", "          ref: main\n           token: ${{ github.token }}")],
  ["misindented refresh environment", (source) => replaceRequired(source, "          GITHUB_TOKEN: ${{ github.token }}", "          GITHUB_TOKEN: ${{ github.token }}\n           SAFE_FLAG: true")],
  ["nested line under scalar run", (source) => replaceRequired(source, "      - name: Run tests\n        run: npm test", "      - name: Run tests\n        run: npm test\n          working-directory: preview")],
  ["unexpected allowlist path", (source) => replaceRequired(source, '    "preview/index.html"', '    "preview/index.html"\n    "README.md"')],
];

for (const [name, mutate] of mutations) {
  test(`rejects mutated workflow: ${name}`, () => {
    assert.throws(() => assertWorkflowContract(mutate(workflow), expectedSvgFilenames), /Workflow contract violations/);
  });
}
