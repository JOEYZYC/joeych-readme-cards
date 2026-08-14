import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const types = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml" };

export function createPreviewHandler(rootDirectory = join(process.cwd(), "preview")) {
  const root = resolve(rootDirectory);
  return async (request, response) => {
    const pathname = request.url === "/" ? "/index.html" : new URL(request.url, "http://localhost").pathname;
    if (pathname === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    const filePath = normalize(join(root, pathname));
    const relativePath = relative(root, filePath);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    try {
      const body = await readFile(filePath);
      response.writeHead(200, { "Content-Type": types[extname(filePath)] ?? "application/octet-stream" });
      response.end(body);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Preview file unavailable");
    }
  };
}

export function createPreviewServer(rootDirectory) {
  return createServer(createPreviewHandler(rootDirectory));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createPreviewServer().listen(4173, () => console.log("Preview server: http://127.0.0.1:4173"));
}
