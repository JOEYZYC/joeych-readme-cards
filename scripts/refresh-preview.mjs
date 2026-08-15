import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runArtifactTransaction } from "./artifact-transaction.mjs";
import { writePreviewTree } from "./generate-preview.mjs";
import { refreshGithubStats } from "./refresh-github-stats.mjs";

const defaultSnapshotPath = fileURLToPath(new URL("../data/github-stats.json", import.meta.url));
const defaultPreviewPath = fileURLToPath(new URL("../preview/", import.meta.url));
const defaultFileSystem = { mkdir, readFile, readdir, rename, rm, writeFile };

export async function refreshPreview({
  snapshotPath = defaultSnapshotPath,
  previewPath = defaultPreviewPath,
  refresh = refreshGithubStats,
  generate = writePreviewTree,
  token = process.env.GITHUB_TOKEN,
  fetchImpl = globalThis.fetch,
  transactionId,
  fileSystem = defaultFileSystem,
} = {}) {
  await runArtifactTransaction({
    parentPath: dirname(previewPath),
    name: `${basename(previewPath)}-publication`,
    transactionId,
    fileSystem,
    stage: async (workspacePath) => {
      const stagedSnapshot = join(workspacePath, "staged-github-stats.json");
      const stagedPreview = join(workspacePath, "staged-preview");
      await refresh({ targetPath: stagedSnapshot, token, fetchImpl, fileSystem });
      await generate({
        previewDirectory: stagedPreview,
        outputDirectory: join(stagedPreview, "svgs"),
        indexFile: join(stagedPreview, "index.html"),
        snapshotFile: stagedSnapshot,
        fileSystem,
      });
      return [
        { name: "github-stats.json", stagedPath: stagedSnapshot, targetPath: snapshotPath },
        { name: "preview", stagedPath: stagedPreview, targetPath: previewPath },
      ];
    },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await refreshPreview();
  console.log("Refreshed GitHub statistics and deterministic SVG previews");
}
