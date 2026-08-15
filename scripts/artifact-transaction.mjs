import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

const defaultFileSystem = { mkdir, rename, rm };

export function transactionPaths(parentPath, name, transactionId) {
  return {
    lockPath: join(parentPath, `.${name}.lock`),
    workspacePath: join(parentPath, `.${name}.${process.pid}.${transactionId}`),
  };
}

async function rollback(entries, states, workspacePath, fileSystem) {
  const rollbackErrors = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (!states[index].promoted) continue;
    try {
      await fileSystem.rename(entries[index].targetPath, join(workspacePath, `rollback-${entries[index].name}`));
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (!states[index].backedUp) continue;
    try {
      await fileSystem.rename(states[index].backupPath, entries[index].targetPath);
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  return rollbackErrors;
}

async function promote(entries, workspacePath, fileSystem) {
  const backupDirectory = join(workspacePath, "backups");
  await fileSystem.mkdir(backupDirectory);
  const states = entries.map((entry) => ({
    backedUp: false,
    promoted: false,
    backupPath: join(backupDirectory, entry.name),
  }));

  try {
    for (let index = 0; index < entries.length; index += 1) {
      try {
        await fileSystem.rename(entries[index].targetPath, states[index].backupPath);
        states[index].backedUp = true;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    for (let index = 0; index < entries.length; index += 1) {
      await fileSystem.rename(entries[index].stagedPath, entries[index].targetPath);
      states[index].promoted = true;
    }
  } catch (error) {
    const rollbackErrors = await rollback(entries, states, workspacePath, fileSystem);
    if (rollbackErrors.length > 0) throw new AggregateError([error, ...rollbackErrors], "Artifact promotion and rollback failed");
    throw error;
  }
}

export async function runArtifactTransaction({
  parentPath,
  name,
  stage,
  transactionId = randomUUID(),
  fileSystem = defaultFileSystem,
}) {
  const { lockPath, workspacePath } = transactionPaths(parentPath, name, transactionId);
  let lockOwned = false;
  let workspaceOwned = false;
  let failure;

  try {
    await fileSystem.mkdir(lockPath);
    lockOwned = true;
    await fileSystem.mkdir(workspacePath);
    workspaceOwned = true;
    const entries = await stage(workspacePath);
    await promote(entries, workspacePath, fileSystem);
  } catch (error) {
    failure = error;
  }

  const cleanupErrors = [];
  if (workspaceOwned) {
    try {
      await fileSystem.rm(workspacePath, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (lockOwned) {
    try {
      await fileSystem.rm(lockPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length > 0) throw new AggregateError(failure ? [failure, ...cleanupErrors] : cleanupErrors, "Artifact transaction cleanup failed");
  if (failure) throw failure;
}
