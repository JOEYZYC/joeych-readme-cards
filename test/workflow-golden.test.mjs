import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/refresh-profile-svgs.yml", import.meta.url), "utf8");
const golden = await readFile(new URL("./fixtures/workflow.golden.yml", import.meta.url), "utf8");

test("scheduled publisher workflow matches its golden fixture byte for byte", () => {
  assert.equal(workflow, golden);
});
