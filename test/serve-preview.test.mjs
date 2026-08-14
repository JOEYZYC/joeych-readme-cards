import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createPreviewServer } from "../scripts/serve-preview.mjs";

test("preview server serves valid files and survives a missing-file request", async () => {
  const server = createPreviewServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const index = await fetch(`${baseUrl}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-type"), /text\/html/);
    const missing = await fetch(`${baseUrl}/svgs/missing.svg`);
    assert.equal(missing.status, 404);
    assert.equal(await missing.text(), "Preview file unavailable");
    const svg = await fetch(`${baseUrl}/svgs/header_dark.svg`);
    assert.equal(svg.status, 200);
    assert.match(await svg.text(), /<svg /);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
