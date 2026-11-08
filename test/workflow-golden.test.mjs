import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/refresh-profile-svgs.yml", import.meta.url), "utf8");
const golden = await readFile(new URL("./fixtures/workflow.golden.yml", import.meta.url), "utf8");
const devtools = JSON.parse(await readFile(new URL("../.devtools.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const steps = workflow.split(/^      - name: /m).slice(1);

test("scheduled publisher workflow matches its golden fixture byte for byte", () => {
  assert.equal(workflow, golden);
});

test("publisher aligns Node and npm with the project runtime contract before npm ci", () => {
  assert.ok(workflow.includes(`node-version: "${devtools.tools.node.version}"`));
  assert.equal(devtools.packageManager, packageJson.packageManager);

  const setupIndex = steps.findIndex((step) => step.startsWith("Setup Node\n"));
  const npmIndex = steps.findIndex((step) => step.startsWith("Install pinned npm\n"));
  const dependenciesIndex = steps.findIndex((step) => step.startsWith("Install dependencies\n"));
  assert.ok(setupIndex >= 0 && setupIndex < npmIndex && npmIndex < dependenciesIndex);
  assert.ok(steps[npmIndex].includes(`package_manager="$(node -p 'require("./package.json").packageManager')"`));
  assert.ok(steps[npmIndex].includes('npm install --global "$package_manager"'));
  assert.ok(steps[npmIndex].includes('test "npm@$(npm --version)" = "$package_manager"'));
  assert.match(steps[dependenciesIndex], /^        run: npm ci$/m);
});

test("publisher uploads only hidden transaction recovery workspaces on failure", () => {
  const recovery = steps.find((step) => step.startsWith("Preserve publication recovery workspace\n"));
  assert.ok(recovery);
  assert.match(recovery, /^        if: failure\(\)$/m);
  assert.match(recovery, /^        uses: actions\/upload-artifact@v7$/m);
  assert.match(recovery, /^          name: publication-recovery-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}$/m);
  assert.match(recovery, /^          path: \.preview-publication\.\*\/$/m);
  assert.match(recovery, /^          include-hidden-files: true$/m);
  assert.match(recovery, /^          if-no-files-found: ignore$/m);
  assert.match(recovery, /^          retention-days: 7$/m);
});
