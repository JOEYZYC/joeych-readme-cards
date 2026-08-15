import assert from "node:assert/strict";
import { access, appendFile, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { formatCommand, runCommand } from "./process-runner.mjs";
import { workflowSteps } from "./workflow-contract.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const tempParent = "C:/Users/JOEYCH/AppData/Local/Temp/opencode";
const gitBash = "D:/Dev/Utilities/Git/2.54.0/bin/bash.exe";
const gitEnvironment = { ...process.env, GIT_MASTER: "1" };
const commandTimeoutMs = 30_000;
const cancellation = new AbortController();
const interrupt = () => cancellation.abort();
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

async function run(executable, args, cwd, { env = gitEnvironment, allowFailure = false } = {}) {
  console.log(`$ (${cwd}) ${formatCommand(executable, args)}`);
  const result = await runCommand(executable, args, cwd, {
    env,
    allowFailure,
    timeoutMs: commandTimeoutMs,
    signal: cancellation.signal,
  });
  if (result.stdout) console.log(result.stdout.trimEnd());
  if (result.stderr) console.log(result.stderr.trimEnd());
  console.log(`exit=${result.code}`);
  return result;
}

function git(args, cwd, options) {
  return run("git", args, cwd, options);
}

function bash(script, cwd, environment = {}) {
  return run(gitBash, ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", script], cwd, {
    env: { ...gitEnvironment, ...environment },
    allowFailure: environment.ALLOW_FAILURE === "1",
  });
}

async function clone(remote, destination, root) {
  await git(["clone", remote, destination], root);
  return join(root, destination);
}

async function changedPaths(repository, cached = false) {
  const args = ["diff", ...(cached ? ["--cached"] : []), "--name-only"];
  const result = await git(args, repository);
  return result.stdout.trim().split(/\r?\n/).filter(Boolean);
}

const workflow = await readFile(join(projectRoot, ".github/workflows/refresh-profile-svgs.yml"), "utf8");
const steps = workflowSteps(workflow);
const trustedRef = steps.get("Require trusted main ref").run;
const guardAndStage = steps.get("Guard and stage generated files").run;
const detectChanges = steps.get("Detect staged changes").run;
const commitChanges = steps.get("Commit generated assets").run;
const pushChanges = steps.get("Push generated assets").run;

let fixtureRoot;
try {
  fixtureRoot = await mkdtemp(join(tempParent, "task-5-workflow-"));
  const seed = join(fixtureRoot, "seed");
  await cp(projectRoot, seed, {
    recursive: true,
    filter(source) {
      const path = relative(projectRoot, source);
      const first = path.split(sep)[0];
      return ![".git", ".omo", "node_modules"].includes(first);
    },
  });
  await git(["init", "--initial-branch=main"], seed);
  await git(["add", "--all"], seed);
  await git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture baseline"], seed);
  const remote = join(fixtureRoot, "origin.git");
  await git(["clone", "--bare", seed, remote], fixtureRoot);

  console.log("\nSCENARIO no-op staging");
  const noOp = await clone(remote, "no-op", fixtureRoot);
  await bash(guardAndStage, noOp, { GITHUB_REF: "refs/heads/main" });
  await bash(detectChanges, noOp, { GITHUB_OUTPUT: ".git/github-output" });
  assert.equal(await readFile(join(noOp, ".git/github-output"), "utf8"), "changed=false\n");
  assert.deepEqual(await changedPaths(noOp, true), []);
  console.log("ASSERT no-op has no staged commit candidate: PASS");

  console.log("\nSCENARIO one generated change");
  const changed = await clone(remote, "changed", fixtureRoot);
  await appendFile(join(changed, "preview/index.html"), "\nfixture-change\n");
  await bash(guardAndStage, changed, { GITHUB_REF: "refs/heads/main" });
  assert.deepEqual(await changedPaths(changed, true), ["preview/index.html"]);
  await bash(detectChanges, changed, { GITHUB_OUTPUT: ".git/github-output" });
  assert.equal(await readFile(join(changed, ".git/github-output"), "utf8"), "changed=true\n");
  console.log("ASSERT generated change stages only preview/index.html: PASS");

  console.log("\nSCENARIO wrong ref exits before refresh");
  const wrongRef = await clone(remote, "wrong-ref", fixtureRoot);
  const wrongResult = await bash(`${trustedRef}\nprintf 'refresh-ran\\n' > .git/refresh-marker`, wrongRef, {
    GITHUB_REF: "refs/heads/feature",
    ALLOW_FAILURE: "1",
  });
  assert.notEqual(wrongResult.code, 0);
  await assert.rejects(access(join(wrongRef, ".git/refresh-marker")));
  console.log("ASSERT wrong ref stopped before refresh marker: PASS");

  console.log("\nSCENARIO unrelated tracked change");
  const tracked = await clone(remote, "tracked", fixtureRoot);
  await appendFile(join(tracked, "README.md"), "\nunrelated tracked change\n");
  const trackedResult = await bash(guardAndStage, tracked, { GITHUB_REF: "refs/heads/main", ALLOW_FAILURE: "1" });
  assert.notEqual(trackedResult.code, 0);
  assert.deepEqual(await changedPaths(tracked, true), []);
  console.log("ASSERT unrelated tracked path rejected before staging: PASS");

  console.log("\nSCENARIO unrelated untracked change");
  const untracked = await clone(remote, "untracked", fixtureRoot);
  await writeFile(join(untracked, "unexpected.txt"), "unrelated untracked change\n");
  const untrackedResult = await bash(guardAndStage, untracked, { GITHUB_REF: "refs/heads/main", ALLOW_FAILURE: "1" });
  assert.notEqual(untrackedResult.code, 0);
  assert.deepEqual(await changedPaths(untracked, true), []);
  console.log("ASSERT unrelated untracked path rejected before staging: PASS");

  console.log("\nSCENARIO non-fast-forward race");
  const publisher = await clone(remote, "publisher", fixtureRoot);
  const competitor = await clone(remote, "competitor", fixtureRoot);
  await appendFile(join(publisher, "preview/index.html"), "\npublisher change\n");
  await bash(guardAndStage, publisher, { GITHUB_REF: "refs/heads/main" });
  await bash(commitChanges, publisher);
  await appendFile(join(competitor, "README.md"), "\ncompeting remote change\n");
  await git(["add", "README.md"], competitor);
  await git(["-c", "user.name=Competitor", "-c", "user.email=competitor@example.invalid", "commit", "-m", "advance remote"], competitor);
  await git(["push", "origin", "HEAD:main"], competitor);
  const pushResult = await bash(pushChanges, publisher, { ALLOW_FAILURE: "1" });
  assert.notEqual(pushResult.code, 0);
  assert.match(`${pushResult.stdout}\n${pushResult.stderr}`, /(?:non-fast-forward|rejected|fetch first)/i);
  assert.deepEqual(await changedPaths(publisher), []);
  console.log("ASSERT one exact push failed without retry or force: PASS");
} finally {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
  if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

await assert.rejects(access(resolve(fixtureRoot)));
console.log(`CLEANUP ${fixtureRoot} exists=false`);
