import type { Plugin } from "vite";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join, sep, extname } from "node:path";

/** Serve the installed, lockfile-pinned Monaco runtime from the app's own origin. */
export function monacoAssets(root: string): Plugin {
  const directory = resolve(root, "node_modules/monaco-editor/min/vs");
  const prefix = "/monaco/vs/";
  return {
    name: "lifemark-monaco-assets",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(prefix)) { next(); return; }
        try {
          const name = decodeURIComponent(req.url.split("?")[0].slice(prefix.length));
          const target = resolve(directory, name);
          if (!target.startsWith(directory + sep)) { res.statusCode = 403; res.end(); return; }
          const content = await readFile(target);
          const mime: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ttf": "font/ttf" };
          res.setHeader("Content-Type", mime[extname(target)] ?? "application/octet-stream");
          res.end(content);
        } catch { res.statusCode = 404; res.end(); }
      });
    },
    async generateBundle() {
      const emit = async (folder: string, relative = "") => {
        for (const entry of await readdir(folder, { withFileTypes: true })) {
          const name = relative ? `${relative}/${entry.name}` : entry.name;
          if (entry.isDirectory()) await emit(join(folder, entry.name), name);
          else this.emitFile({ type: "asset", fileName: `monaco/vs/${name}`, source: await readFile(join(folder, entry.name)) });
        }
      };
      await emit(directory);
    },
  };
}
