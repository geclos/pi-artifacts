import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDist, ensureArtifactScaffold, ensurePreviewServer, importArtifactFromUrl, listArtifacts, previewUrl, readMetadata } from "./store/artifactStore.js";
import { validateArtifact, formatValidation } from "./tools/validate.js";
import { publishCloudflare } from "./cloudflare/deploy.js";
import type { PublishTarget } from "./types.js";
import { formatDesignSystemForPrompt, resolveDesignSystem } from "./design/resolveDesignSystem.js";

function text(content: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text: content }], details };
}

function openUrl(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
  child.unref();
}

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export default function piArtifacts(pi: ExtensionAPI) {
  pi.on("resources_discover", async () => ({ skillPaths: [join(packageRoot, "skills")] }));

  pi.on("before_agent_start", async (event, ctx) => {
    const design = await resolveDesignSystem(ctx.cwd);
    if (!design) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\nArtifact design system override:\nIf creating or editing a Pi artifact, follow this ${design.scope}-scoped Markdown design system before the built-in Geist/Pi Artifact UI defaults, while preserving self-contained artifact constraints.\n\n${design.content}`,
    };
  });

  pi.registerTool({
    name: "artifact_create",
    label: "Create Artifact",
    description: "Create a self-contained Pi artifact scaffold using the bundled Geist-grounded design system.",
    promptSnippet: "Create a polished self-contained HTML artifact scaffold.",
    promptGuidelines: ["Use artifact_create when the user asks to create a visual/shareable artifact, then edit the created source/index.html file."],
    parameters: Type.Object({
      title: Type.String({ description: "Artifact title" }),
      instructions: Type.String({ description: "What the artifact should communicate or do" }),
      kind: Type.Optional(Type.String({ description: "dashboard, diff-walkthrough, timeline, prototype, report, or custom" })),
      format: Type.Optional(Type.String({ description: "html (default) or md for raw Markdown artifacts" })),
      id: Type.Optional(Type.String({ description: "Optional stable artifact id/slug" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const created = await ensureArtifactScaffold(ctx.cwd, params as { title: string; instructions: string; kind?: string; id?: string; format?: "html" | "md" });
      const design = await resolveDesignSystem(ctx.cwd);
      return text(`Created artifact ${created.id}.\nSource: ${created.sourcePath}\nDist: ${created.distPath}\n\n${formatDesignSystemForPrompt(design)}\n\nNext: edit source/index.html to satisfy: ${(params as any).instructions}`, { ...created, designSystem: design });
    },
  });

  pi.registerTool({
    name: "artifact_validate",
    label: "Validate Artifact",
    description: "Validate a Pi artifact for self-contained runtime, Pi Artifact UI usage, and Cloudflare temporary publish limits.",
    parameters: Type.Object({ id: Type.String(), strict: Type.Optional(Type.Boolean()) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      await buildDist(ctx.cwd, (params as any).id);
      const result = await validateArtifact(ctx.cwd, (params as any).id, Boolean((params as any).strict));
      return text(formatValidation(result), result as unknown as Record<string, unknown>);
    },
  });

  pi.registerTool({
    name: "artifact_preview",
    label: "Preview Artifact",
    description: "Serve an artifact locally and optionally open it in a browser.",
    parameters: Type.Object({ id: Type.String(), open: Type.Optional(Type.Boolean()) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      await buildDist(ctx.cwd, (params as any).id);
      const port = await ensurePreviewServer(ctx.cwd);
      const url = previewUrl(port, (params as any).id);
      if ((params as any).open !== false) openUrl(url);
      return text(`Preview: ${url}`, { url });
    },
  });

  pi.registerTool({
    name: "artifact_publish",
    label: "Publish Artifact",
    description: "Publish an artifact to Cloudflare Workers Static Assets, using temporary no-signup deployments by default.",
    parameters: Type.Object({
      id: Type.String(),
      target: Type.Optional(Type.String({ description: "cloudflare-temporary (default), cloudflare-auto, or cloudflare-permanent" })),
      confirmPublic: Type.Optional(Type.Boolean()),
      noindex: Type.Optional(Type.Boolean()),
      domain: Type.Optional(Type.String({ description: "Optional custom domain for permanent Cloudflare deployments" })),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const id = (params as any).id as string;
      const target = ((params as any).target || "cloudflare-temporary") as PublishTarget;
      const noindex = (params as any).noindex !== false;
      await buildDist(ctx.cwd, id, noindex);
      const validation = await validateArtifact(ctx.cwd, id, true);
      if (!validation.ok) return { ...text(`Publish blocked by validation errors:\n${formatValidation(validation)}`, validation as unknown as Record<string, unknown>), isError: true } as any;
      if ((params as any).confirmPublic !== false && ctx.hasUI) {
        const ok = await ctx.ui.confirm("Publish public artifact?", "This artifact will be publicly accessible at a workers.dev URL. Temporary Cloudflare artifacts expire after 60 minutes unless claimed. Do not publish secrets, credentials, customer data, or proprietary data. Continue?");
        if (!ok) return text("Publish cancelled by user.", { cancelled: true });
      }
      const published = await publishCloudflare({ cwd: ctx.cwd, id, target, domain: (params as any).domain, signal });
      const claimLine = published.claimUrl ? `\nClaim within 60 minutes to keep it: ${published.claimUrl}` : "";
      return text(`Published artifact:\n${published.url}${claimLine}`, published as unknown as Record<string, unknown>);
    },
  });

  pi.registerTool({
    name: "artifact_import_url",
    label: "Import Artifact URL",
    description: "Import an existing published artifact/page URL into the local artifact store for update or republish workflows.",
    parameters: Type.Object({ url: Type.String(), title: Type.Optional(Type.String()), id: Type.Optional(Type.String()) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const created = await importArtifactFromUrl(ctx.cwd, (params as any).url, (params as any).title, (params as any).id);
      return text(`Imported ${(params as any).url} as artifact ${created.id}.\nSource: ${created.sourcePath}`, created);
    },
  });

  pi.registerTool({
    name: "artifact_list",
    label: "List Artifacts",
    description: "List local Pi artifacts and their latest publish URLs.",
    parameters: Type.Object({ includePublished: Type.Optional(Type.Boolean()) }),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const metas = await listArtifacts(ctx.cwd);
      const lines = metas.length ? metas.map((m) => `- ${m.id}: ${m.title}${m.latestPublishedUrl ? ` (${m.latestPublishedUrl})` : ""}`) : ["No artifacts found."];
      return text(lines.join("\n"), { artifacts: metas });
    },
  });

  pi.registerTool({
    name: "artifact_open",
    label: "Open Artifact",
    description: "Open an artifact local preview or its latest published URL.",
    parameters: Type.Object({ id: Type.String(), target: Type.Optional(Type.String({ description: "local or published" })) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const id = (params as any).id as string;
      const target = (params as any).target || "local";
      let url: string;
      if (target === "published") {
        const meta = await readMetadata(ctx.cwd, id);
        if (!meta.latestPublishedUrl) return { ...text(`Artifact ${id} has no published URL.`), isError: true } as any;
        url = meta.latestPublishedUrl;
      } else {
        await buildDist(ctx.cwd, id);
        url = previewUrl(await ensurePreviewServer(ctx.cwd), id);
      }
      openUrl(url);
      return text(`Opened: ${url}`, { url });
    },
  });

  pi.registerCommand("artifact", {
    description: "Manage Pi artifacts: list, open <id>, validate <id>, publish <id>",
    handler: async (args, ctx) => {
      const [cmd, id] = (args || "list").trim().split(/\s+/);
      if (cmd === "design") {
        const design = await resolveDesignSystem(ctx.cwd);
        ctx.ui.notify(formatDesignSystemForPrompt(design), "info");
        return;
      }
      if (cmd === "list" || cmd === "gallery") {
        const metas = await listArtifacts(ctx.cwd);
        if (cmd === "gallery" && metas.length && ctx.hasUI) {
          const choice = await ctx.ui.select("Open artifact", metas.map((m) => `${m.id} — ${m.title}`));
          const selected = metas.find((m) => choice?.startsWith(`${m.id} —`));
          if (selected) openUrl(previewUrl(await ensurePreviewServer(ctx.cwd), selected.id));
        } else {
          ctx.ui.notify(metas.length ? metas.map((m) => `${m.id}: ${m.title}`).join("\n") : "No artifacts found.", "info");
        }
        return;
      }
      if (!id) { ctx.ui.notify("Usage: /artifact list|gallery|design|open|validate|publish <id>", "error"); return; }
      if (cmd === "open") {
        const url = previewUrl(await ensurePreviewServer(ctx.cwd), id);
        openUrl(url); ctx.ui.notify(`Opened ${url}`, "info"); return;
      }
      if (cmd === "validate") {
        await buildDist(ctx.cwd, id);
        ctx.ui.notify(formatValidation(await validateArtifact(ctx.cwd, id, true)), "info"); return;
      }
      if (cmd === "publish") {
        await buildDist(ctx.cwd, id);
        const ok = await ctx.ui.confirm("Publish public artifact?", "This artifact will be publicly accessible. Continue?");
        if (!ok) return;
        const published = await publishCloudflare({ cwd: ctx.cwd, id, target: "cloudflare-temporary", signal: ctx.signal, onUpdate: (s) => ctx.ui.setStatus("artifact-publish", s.slice(-80)) });
        ctx.ui.notify(`Published: ${published.url}`, "info"); return;
      }
      ctx.ui.notify("Usage: /artifact list|gallery|design|open|validate|publish <id>", "error");
    },
  });
}
