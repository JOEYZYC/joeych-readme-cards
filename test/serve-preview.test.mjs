import assert from "node:assert/strict";
import { once } from "node:events";
import { get } from "node:http";
import test from "node:test";
import { createPreviewHandler, createPreviewServer } from "../scripts/serve-preview.mjs";

test("preview handler returns 400 for a malformed request target", async () => {
  const response = {
    writeHead(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    end(body) {
      this.body = body;
    },
  };

  await createPreviewHandler()({ url: "http://[" }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body, "Bad Request");
});

test("preview server returns 400 for a malformed target and continues serving", async () => {
  const server = createPreviewServer();
  let receivedTarget;
  server.once("request", (request) => { receivedTarget = request.url; });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    const malformed = await new Promise((resolve, reject) => {
      const request = get({ hostname: "127.0.0.1", port, path: "http://[" }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => resolve({ statusCode: response.statusCode, body }));
        response.on("error", reject);
      });
      request.on("error", reject);
      request.setTimeout(5000, () => request.destroy(new Error("Preview response timed out")));
    });
    assert.equal(receivedTarget, "http://[");
    assert.equal(malformed.statusCode, 400);
    assert.equal(malformed.body, "Bad Request");

    const index = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get("content-type"), /text\/html/);
    await index.text();
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

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
