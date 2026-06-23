import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PublishTarget, PublishedInfo } from "../types.js";
import { parseWranglerOutput } from "./parseWranglerOutput.js";
import { writeWranglerProject } from "./wranglerProject.js";
import { readMetadata, writeMetadata } from "../store/artifactStore.js";

export interface DeployOptions {
  cwd: string;
  id: string;
  target: PublishTarget;
  domain?: string;
  onUpdate?: (text: string) => void;
  signal?: AbortSignal;
}

export async function publishCloudflare(opts: DeployOptions): Promise<PublishedInfo & { rawOutput: string }> {
  const { deployDir, configPath } = await writeWranglerProject(opts.cwd, opts.id);
  const mode = opts.target === "cloudflare-permanent" ? "permanent" : "temporary";
  const args = ["wrangler@latest", "deploy", "--config", configPath];
  if (mode === "temporary") args.push("--temporary");
  if (opts.domain && mode === "permanent") args.push("--domain", opts.domain);

  const tempHome = mode === "temporary" ? await mkdtemp(join(tmpdir(), "pi-artifacts-wrangler-home-")) : undefined;
  let result: { exitCode: number; output: string };
  try {
    result = await runNpx(args, deployDir, opts.signal, opts.onUpdate, tempHome ? isolatedCloudflareEnv(tempHome) : undefined);
  } finally {
    if (tempHome) await rm(tempHome, { recursive: true, force: true });
  }
  const target: PublishTarget = mode === "temporary" ? "cloudflare-temporary" : "cloudflare-permanent";

  if (result.exitCode !== 0) throw new Error(`Wrangler deploy failed with exit code ${result.exitCode}.\n${result.output}`);

  const parsed = parseWranglerOutput(result.output);
  if (!parsed.url) throw new Error(`Could not find workers.dev deployment URL in Wrangler output.\n${result.output}`);
  const now = new Date().toISOString();
  const published: PublishedInfo & { rawOutput: string } = {
    target,
    url: parsed.url,
    claimUrl: parsed.claimUrl,
    expiresAt: target === "cloudflare-temporary" ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : undefined,
    createdAt: now,
    rawOutput: result.output,
  };
  const meta = await readMetadata(opts.cwd, opts.id);
  const version = (meta.versions.at(-1)?.version || 0) + 1;
  meta.versions.push({ version, createdAt: now, path: "dist/index.html", published });
  meta.latestPublishedUrl = published.url;
  await writeMetadata(opts.cwd, meta);
  return published;
}

function isolatedCloudflareEnv(home: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLOUDFLARE_API_TOKEN;
  delete env.CLOUDFLARE_EMAIL;
  delete env.CLOUDFLARE_API_KEY;
  delete env.CF_API_TOKEN;
  delete env.CF_EMAIL;
  delete env.CF_API_KEY;
  env.HOME = home;
  env.XDG_CONFIG_HOME = join(home, ".config");
  return env;
}

function runNpx(args: string[], cwd: string, signal?: AbortSignal, onUpdate?: (text: string) => void, env: NodeJS.ProcessEnv = process.env): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", ...args], { cwd, shell: false, env });
    let output = "";
    const append = (chunk: Buffer) => { const text = chunk.toString(); output += text; onUpdate?.(text); };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: code ?? 1, output }));
    if (signal) {
      if (signal.aborted) child.kill("SIGTERM");
      signal.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
    }
  });
}
