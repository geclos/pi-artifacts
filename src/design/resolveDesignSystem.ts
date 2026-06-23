import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, relative } from "node:path";

export interface ResolvedDesignSystem {
  scope: "project" | "user";
  path: string;
  displayPath: string;
  content: string;
  fingerprint: string;
}

const MAX_DESIGN_BYTES = 64 * 1024;

export async function resolveDesignSystem(cwd: string): Promise<ResolvedDesignSystem | undefined> {
  const candidates: Array<{ scope: "project" | "user"; path: string; displayPath: string }> = [
    { scope: "project", path: join(cwd, ".pi", "artifacts", "DESIGN.md"), displayPath: ".pi/artifacts/DESIGN.md" },
    { scope: "user", path: join(homedir(), ".pi", "agent", "artifacts", "DESIGN.md"), displayPath: "~/.pi/agent/artifacts/DESIGN.md" },
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) continue;
    const raw = await readFile(candidate.path, "utf8");
    const content = raw.length > MAX_DESIGN_BYTES ? raw.slice(0, MAX_DESIGN_BYTES) + "\n\n[Truncated by pi-artifacts at 64 KiB]" : raw;
    const fingerprint = "sha256-" + createHash("sha256").update(raw).digest("hex");
    return { ...candidate, displayPath: candidate.scope === "project" ? relative(cwd, candidate.path) || candidate.displayPath : candidate.displayPath, content, fingerprint };
  }
  return undefined;
}

export function formatDesignSystemForPrompt(design: ResolvedDesignSystem | undefined) {
  if (!design) {
    return "No project or user artifact DESIGN.md was found. Use the built-in Pi Artifact UI, grounded in Vercel Geist.";
  }
  return `Active artifact design system (${design.scope}-scoped: ${design.displayPath}, ${design.fingerprint}):\n\n${design.content}`;
}
