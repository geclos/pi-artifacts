import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ValidationIssue, ValidationResult } from "../types.js";
import { artifactDir, findEntryFile, walkFiles } from "../store/artifactStore.js";

const MAX_TEMP_ASSET_BYTES = 5 * 1024 * 1024;
const MAX_TEMP_FILES = 1000;
const TARGET_TOTAL_BYTES = 16 * 1024 * 1024;

export async function validateArtifact(cwd: string, id: string, strict = false): Promise<ValidationResult> {
  const dir = artifactDir(cwd, id);
  const dist = join(dir, "dist");
  const entrySource = await findEntryFile(cwd, id);
  const entryName = entrySource ? entrySource.split("/").pop()! : "index.html";
  const entry = join(dist, entryName);
  const isMarkdown = entryName.endsWith(".md");
  const issues: ValidationIssue[] = [];
  if (!existsSync(join(dir, "artifact.json"))) {
    issues.push({ severity: "error", code: "missing_metadata", message: `Missing artifact metadata for ${id}.` });
  }
  if (!existsSync(entry)) {
    issues.push({ severity: "error", code: "missing_entry", message: `Missing dist/${entryName}.` });
    return { ok: false, issues, fileCount: 0, totalBytes: 0 };
  }
  const files = await walkFiles(dist);
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  if (files.length > MAX_TEMP_FILES) issues.push({ severity: "error", code: "too_many_files", message: `Cloudflare temporary Workers assets support at most ${MAX_TEMP_FILES} files; found ${files.length}.` });
  for (const f of files) {
    if (f.bytes > MAX_TEMP_ASSET_BYTES) issues.push({ severity: "error", code: "file_too_large", file: f.rel, message: `${f.rel} is ${(f.bytes / 1024 / 1024).toFixed(2)} MiB; Cloudflare temporary asset limit is 5 MiB per file.` });
  }
  if (totalBytes > TARGET_TOTAL_BYTES) issues.push({ severity: strict ? "error" : "warning", code: "total_size_large", message: `Total artifact size is ${(totalBytes / 1024 / 1024).toFixed(2)} MiB; target is <= 16 MiB.` });

  const content = await readFile(entry, "utf8");

  if (!isMarkdown) {
    const checks: Array<[RegExp, string, string]> = [
      [/<script\s+[^>]*src\s*=\s*["']https?:\/\//i, "external_script", "External script source detected."],
      [/<link\s+[^>]*href\s*=\s*["']https?:\/\//i, "external_stylesheet", "External stylesheet/font link detected."],
      [/<img\s+[^>]*src\s*=\s*["']https?:\/\//i, "external_image", "External image detected; embed as data URI or inline SVG."],
      [/@import\s+url\(\s*["']?https?:\/\//i, "external_css_import", "External CSS import detected."],
      [/\bfetch\s*\(/i, "fetch", "fetch() detected; artifacts must not call APIs at view time."],
      [/\bXMLHttpRequest\b/i, "xhr", "XMLHttpRequest detected; artifacts must not call APIs at view time."],
      [/\bWebSocket\b/i, "websocket", "WebSocket detected; artifacts must not call APIs at view time."],
    ];
    for (const [re, code, message] of checks) if (re.test(content)) issues.push({ severity: strict ? "error" : "warning", code, message, file: entryName });
    if (!content.includes("Pi Artifact UI") && !content.includes("--ds-background-100") && !content.includes("pi-shell")) {
      issues.push({ severity: strict ? "error" : "warning", code: "missing_design_system", message: "Artifact does not appear to include the Pi Artifact UI theme/classes.", file: entryName });
    }
    const rootOverrides = (content.match(/--ds-[a-z0-9-]+\s*:/gi) || []).length;
    if (rootOverrides > 140) issues.push({ severity: "warning", code: "excessive_token_overrides", message: `Found ${rootOverrides} design-token declarations; avoid excessive custom token overrides.`, file: entryName });
  }

  return { ok: !issues.some((i) => i.severity === "error"), issues, fileCount: files.length, totalBytes };
}

export function formatValidation(result: ValidationResult) {
  const lines = [`${result.ok ? "OK" : "FAILED"}: ${result.fileCount} files, ${(result.totalBytes / 1024).toFixed(1)} KiB`];
  for (const issue of result.issues) lines.push(`${issue.severity.toUpperCase()} ${issue.code}${issue.file ? ` (${issue.file})` : ""}: ${issue.message}`);
  return lines.join("\n");
}
