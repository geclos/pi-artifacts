---
name: artifact-designer
description: Generate polished, self-contained Pi artifacts using the bundled Geist-grounded Pi Artifact UI design system. Use when creating dashboards, timelines, reports, prototypes, diff walkthroughs, or any visual/shareable artifact.
---

# Pi Artifact Designer

Create one self-contained HTML artifact. Use the active artifact design system.

Design system resolution is automatic:

1. Project override: `.pi/artifacts/DESIGN.md`
2. User default: `~/.pi/agent/artifacts/DESIGN.md`
3. Built-in fallback: Pi Artifact UI grounded in Vercel Geist

If a project or user `DESIGN.md` is present, treat it as higher priority than the built-in Geist defaults for visual choices. Still preserve all self-contained artifact and publishing constraints.

Requirements:

- Produce a single `index.html` artifact unless the user specifically asks for Markdown.
- Use semantic HTML inside `<main class="pi-shell">`.
- Use the provided classes: `.pi-header`, `.pi-title`, `.pi-subtitle`, `.pi-card`, `.pi-grid`, `.pi-stack`, `.pi-row`, `.pi-button`, `.pi-button-primary`, `.pi-button-secondary`, `.pi-badge`, `.pi-callout`, `.pi-metric`, `.pi-table`, `.pi-code`, `.pi-tabs`, `.pi-input`.
- Do not load external scripts, stylesheets, fonts, images, or APIs.
- Do not use `fetch`, `XMLHttpRequest`, or `WebSocket`.
- Inline only small JavaScript needed for local interactions.
- Prefer SVG/CSS/HTML for visuals over base64 raster images.
- Keep each generated file under 5 MiB so it can be published with Cloudflare temporary Workers assets.
- Use a minimal, developer-focused aesthetic: whitespace, restrained color, high contrast, crisp borders.
- Use blue for links/focus/positive state, red for errors/destructive state, amber for warnings.
- Use code/mono styling for diffs, IDs, metrics, timestamps, and tabular numbers.
- Include copy/export controls when the artifact is an interactive decision surface so the user can paste results back into pi.

When asked to create an artifact, use the `artifact_create` tool if available, then write or update the artifact HTML in the created path.
