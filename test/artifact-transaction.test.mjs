import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import test from "node:test";
import { runArtifactTransaction, transactionPaths } from "../scripts/artifact-transaction.mjs";

const cleanupOptions = { recursive: true, force: true, maxRetries: 3, retryDelay: 10 };

async function fixture(t, { firstOriginal = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "readme-cards-artifact-transaction-"));
  t.after(() => rm(directory, cleanupOptions));
  for (const name of firstOriginal ? ["first", "second"] : ["second"]) {
    await mkdir(join(directory, name));
    await writeFile(join(directory, name, "bytes.txt"), `original ${name}\n`);
  }
  const transactionId = "fault-injection";
  const paths = transactionPaths(directory, "publication", transactionId);
  return {
    directory,
    ...paths,
    options: {
      parentPath: relative(process.cwd(), directory),
      name: "publication",
      transactionId,
      async stage(workspacePath) {
        return Promise.all(["first", "second"].map(async (name) => {
          const stagedPath = join(workspacePath, `staged-${name}`);
          await mkdir(stagedPath);
          await writeFile(join(stagedPath, "bytes.txt"), `replacement ${name}\n`);
          return { name, stagedPath, targetPath: join(directory, name) };
        }));
      },
    },
  };
}

for (const mode of ["restore", "evacuate", "restore-and-lock-cleanup"]) {
  test(`incomplete ${mode} rollback retains recovery workspace and all errors`, async (t) => {
    const evacuationOnly = mode === "evacuate";
    const f = await fixture(t, { firstOriginal: !evacuationOnly });
    const promotionError = new Error("second promotion denied");
    const rollbackErrors = evacuationOnly
      ? [new Error("first evacuation denied")]
      : [new Error("second restoration denied"), new Error("first restoration denied")];
    const lockError = new Error("owned lock removal denied");
    const removals = [];
    let failure;

    await assert.rejects(runArtifactTransaction({
      ...f.options,
      fileSystem: {
        mkdir,
        async rename(source, destination) {
          const from = resolve(source);
          const to = resolve(destination);
          if (from === join(f.workspacePath, "staged-second")) throw promotionError;
          if (evacuationOnly && to === join(f.workspacePath, "rollback-first")) throw rollbackErrors[0];
          if (!evacuationOnly && from === join(f.workspacePath, "backups", "second")) throw rollbackErrors[0];
          if (!evacuationOnly && from === join(f.workspacePath, "backups", "first")) throw rollbackErrors[1];
          return rename(source, destination);
        },
        async rm(path, options) {
          removals.push(resolve(path));
          if (mode === "restore-and-lock-cleanup" && resolve(path) === f.lockPath) throw lockError;
          return rm(path, options);
        },
      },
    }), (error) => { failure = error; return true; });

    if (evacuationOnly) {
      assert.equal(await readFile(join(f.workspacePath, "staged-second", "bytes.txt"), "utf8"), "replacement second\n");
      assert.equal(await readFile(join(f.directory, "second", "bytes.txt"), "utf8"), "original second\n");
      assert.equal(await readFile(join(f.directory, "first", "bytes.txt"), "utf8"), "replacement first\n");
    } else {
      for (const name of ["first", "second"]) {
        assert.equal(await readFile(join(f.workspacePath, "backups", name, "bytes.txt"), "utf8"), `original ${name}\n`);
      }
      assert.equal(await readFile(join(f.workspacePath, "rollback-first", "bytes.txt"), "utf8"), "replacement first\n");
    }

    assert.ok(failure instanceof AggregateError);
    assert.equal(failure.recoveryPath, f.workspacePath);
    assert.ok(isAbsolute(failure.recoveryPath));
    assert.ok(failure.message.includes(f.workspacePath));
    const rollbackFailure = mode === "restore-and-lock-cleanup" ? failure.errors[0] : failure;
    assert.ok(rollbackFailure instanceof AggregateError);
    assert.deepEqual(rollbackFailure.errors, [promotionError, ...rollbackErrors]);
    assert.equal(rollbackFailure.recoveryPath, f.workspacePath);
    assert.ok(rollbackFailure.message.includes(f.workspacePath));
    assert.deepEqual(removals, [f.lockPath]);
    if (mode === "restore-and-lock-cleanup") {
      assert.deepEqual(failure.errors, [rollbackFailure, lockError]);
      assert.deepEqual(await readdir(f.lockPath), []);
    } else {
      await assert.rejects(readdir(f.lockPath), { code: "ENOENT" });
    }
  });
}

test("an unowned lock collision is untouched and never stages artifacts", async (t) => {
  const f = await fixture(t);
  await mkdir(f.lockPath);
  await writeFile(join(f.lockPath, "owner.txt"), "another transaction\n");
  let staged = false;
  const removals = [];

  await assert.rejects(runArtifactTransaction({
    ...f.options,
    stage: async () => { staged = true; },
    fileSystem: { mkdir, rename, async rm(path, options) { removals.push(path); return rm(path, options); } },
  }), { code: "EEXIST" });

  assert.equal(staged, false);
  assert.deepEqual(removals, []);
  assert.equal(await readFile(join(f.lockPath, "owner.txt"), "utf8"), "another transaction\n");
  for (const name of ["first", "second"]) {
    assert.equal(await readFile(join(f.directory, name, "bytes.txt"), "utf8"), `original ${name}\n`);
  }
  await assert.rejects(readdir(f.workspacePath), { code: "ENOENT" });
});
