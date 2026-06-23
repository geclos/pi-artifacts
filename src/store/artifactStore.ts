import { createServer, type Server } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ArtifactMetadata } from "../types.js";
import { resolveDesignSystem } from "../design/resolveDesignSystem.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const packageRoot = resolve(__dirname, "../..");

export function artifactsRoot(cwd: string) {
  return join(cwd, ".pi", "artifacts");
}

export function slugify(input: string) {
  const slug = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 54);
  return slug || "artifact";
}

export function artifactDir(cwd: string, id: string) {
  return join(artifactsRoot(cwd), id);
}

export async function readTextAsset(pathFromSrc: string) {
  return readFile(join(packageRoot, "src", pathFromSrc), "utf8");
}

export async function ensureArtifactScaffold(cwd: string, params: { id?: string; title: string; kind?: string }) {
  const base = artifactsRoot(cwd);
  await mkdir(base, { recursive: true });
  let id = params.id ? slugify(params.id) : slugify(params.title);
  let dir = artifactDir(cwd, id);
  if (!params.id) {
    let suffix = 2;
    while (existsSync(join(dir, "artifact.json"))) {
      id = `${slugify(params.title)}-${suffix++}`;
      dir = artifactDir(cwd, id);
    }
  }
  await mkdir(join(dir, "source"), { recursive: true });
  await mkdir(join(dir, "dist"), { recursive: true });
  await mkdir(join(dir, "deploy"), { recursive: true });

  const theme = await readTextAsset("design/artifact-theme.css");
  const template = await readTextAsset("design/artifact-template.html");
  const design = await resolveDesignSystem(cwd);
  const designNote = design
    ? `Project/user design system active: ${escapeHtml(design.displayPath)}. Follow its Markdown guidance for visual choices while preserving self-contained artifact constraints.`
    : "This artifact uses Pi Artifact UI, grounded in Vercel Geist.";
  const designComment = design ? `\n<!-- Active artifact design system: ${escapeHtml(design.displayPath)} (${design.fingerprint}). The agent should follow that DESIGN.md for visual choices. -->\n` : "";
  const content = `    <header class="pi-header">\n      <div>\n        <h1 class="pi-title">${escapeHtml(params.title)}</h1>\n        <p class="pi-subtitle">Replace this scaffold with the artifact content.</p>\n      </div>\n      <span class="pi-badge pi-badge-blue">Draft</span>\n    </header>\n    <section class="pi-card pi-stack">\n      <p>${designNote}</p>\n    </section>`;
  const html = template
    .replace("{{title}}", escapeHtml(params.title))
    .replace("{{artifactThemeCss}}", indent(theme, 4))
    .replace("{{artifactSpecificCss}}", "")
    .replace("{{artifactContent}}", designComment + content)
    .replace("{{artifactScript}}", "");
  const sourcePath = join(dir, "source", "index.html");
  if (!existsSync(sourcePath)) await writeFile(sourcePath, html, "utf8");
  await buildDist(cwd, id);

  const now = new Date().toISOString();
  const metaPath = join(dir, "artifact.json");
  if (!existsSync(metaPath)) {
    const meta: ArtifactMetadata = {
      id,
      title: params.title,
      kind: params.kind,
      createdAt: now,
      updatedAt: now,
      designSystem: design ? { scope: design.scope, path: design.displayPath, fingerprint: design.fingerprint } : { scope: "built-in" },
      entry: "dist/index.html",
      versions: [{ version: 1, createdAt: now, path: "dist/index.html" }],
    };
    await writeMetadata(cwd, meta);
  }
  return { id, dir, sourcePath, distPath: join(dir, "dist", "index.html") };
}

export async function buildDist(cwd: string, id: string, noindex = true) {
  const dir = artifactDir(cwd, id);
  await mkdir(join(dir, "dist"), { recursive: true });
  const source = join(dir, "source", "index.html");
  if (existsSync(source)) {
    await cp(source, join(dir, "dist", "index.html"));
  }
  const headers = [
    "/*",
    noindex ? "  X-Robots-Tag: noindex" : undefined,
    "  Referrer-Policy: no-referrer",
    "  X-Content-Type-Options: nosniff",
  ].filter(Boolean).join("\n") + "\n";
  await writeFile(join(dir, "dist", "_headers"), headers, "utf8");
  try {
    const meta = await readMetadata(cwd, id);
    await writeFile(join(dir, "dist", "thumbnail.svg"), renderThumbnail(meta.title), "utf8");
  } catch {}
}

export async function importArtifactFromUrl(cwd: string, url: string, title?: string, id?: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  const html = await response.text();
  const inferredTitle = title || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || new URL(url).hostname;
  const created = await ensureArtifactScaffold(cwd, { title: inferredTitle, id });
  await writeFile(join(artifactDir(cwd, created.id), "source", "index.html"), html, "utf8");
  await buildDist(cwd, created.id);
  const meta = await readMetadata(cwd, created.id);
  meta.latestPublishedUrl = url;
  await writeMetadata(cwd, meta);
  return created;
}

function renderThumbnail(title: string) {
  const safe = escapeHtml(title);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#fafafa"/><rect x="48" y="48" width="1104" height="534" rx="16" fill="#fff" stroke="#000" stroke-opacity=".12"/><text x="96" y="170" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="28" fill="#4d4d4d">Pi Artifact</text><text x="96" y="300" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="64" font-weight="600" letter-spacing="-3" fill="#171717">${safe}</text><circle cx="1088" cy="112" r="24" fill="#006bff"/></svg>`;
}

export async function readMetadata(cwd: string, id: string): Promise<ArtifactMetadata> {
  return JSON.parse(await readFile(join(artifactDir(cwd, id), "artifact.json"), "utf8"));
}

export async function writeMetadata(cwd: string, meta: ArtifactMetadata) {
  meta.updatedAt = new Date().toISOString();
  await writeFile(join(artifactDir(cwd, meta.id), "artifact.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
}

export async function listArtifacts(cwd: string): Promise<ArtifactMetadata[]> {
  const root = artifactsRoot(cwd);
  if (!existsSync(root)) return [];
  const names = await readdir(root);
  const metas: ArtifactMetadata[] = [];
  for (const name of names) {
    try {
      const p = join(root, name, "artifact.json");
      if (existsSync(p)) metas.push(JSON.parse(await readFile(p, "utf8")));
    } catch {}
  }
  return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function walkFiles(dir: string): Promise<Array<{ path: string; rel: string; bytes: number }>> {
  const out: Array<{ path: string; rel: string; bytes: number }> = [];
  async function walk(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const p = join(current, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (entry.isFile()) {
        const s = await stat(p);
        out.push({ path: p, rel: relative(dir, p), bytes: s.size });
      }
    }
  }
  if (existsSync(dir)) await walk(dir);
  return out;
}

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

let previewServer: Server | undefined;
let previewPort: number | undefined;

export async function ensurePreviewServer(cwd: string): Promise<number> {
  if (previewServer && previewPort) return previewPort;
  previewServer = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const prefix = "/artifacts/";
    if (!url.pathname.startsWith(prefix)) {
      res.writeHead(404); res.end("Not found"); return;
    }
    const parts = url.pathname.slice(prefix.length).split("/").filter(Boolean);
    const id = parts.shift();
    if (!id) { res.writeHead(404); res.end("Missing artifact id"); return; }
    const rel = parts.length ? parts.join("/") : "index.html";
    const safeRel = rel.replace(/\.\.+/g, "");
    const p = join(artifactDir(cwd, id), "dist", safeRel);
    if (!resolve(p).startsWith(resolve(artifactDir(cwd, id), "dist")) || !existsSync(p)) {
      res.writeHead(404); res.end("Not found"); return;
    }
    res.writeHead(200, { "content-type": mime[extname(p)] || "application/octet-stream" });
    createReadStream(p).pipe(res);
  });
  await new Promise<void>((resolve, reject) => {
    previewServer!.once("error", reject);
    previewServer!.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = previewServer.address();
  previewPort = typeof addr === "object" && addr ? addr.port : 0;
  return previewPort;
}

export function previewUrl(port: number, id: string) {
  return `http://127.0.0.1:${port}/artifacts/${encodeURIComponent(id)}/`;
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function indent(s: string, spaces: number) {
  const pad = " ".repeat(spaces);
  return s.split("\n").map((line) => line ? pad + line : line).join("\n");
}
