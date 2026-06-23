# pi-artifacts

Pi package for creating, validating, previewing, and publishing self-contained artifacts.

## Features

- `artifact_create` scaffolds a single-page artifact in `.pi/artifacts/<id>/`.
- `artifact_validate` enforces self-contained runtime and Cloudflare temporary Workers limits.
- `artifact_preview` serves a local preview.
- `artifact_publish` publishes through Cloudflare Workers Static Assets using `wrangler deploy --temporary` by default.
- `artifact_import_url` imports an existing public artifact/page for update and republish workflows.
- `/artifact gallery` provides a simple TUI picker.
- Bundled Pi Artifact UI is grounded in Vercel Geist (`https://vercel.com/design.md`).
- Optional Markdown-only design overrides: project `.pi/artifacts/DESIGN.md`, then user `~/.pi/agent/artifacts/DESIGN.md`.

## Custom artifact design systems

Drop a Markdown file in either location:

```txt
.pi/artifacts/DESIGN.md              # project-specific, highest priority
~/.pi/agent/artifacts/DESIGN.md      # user default for all projects
```

First file found wins. No config is required. Example:

```md
# Acme Artifact Design System

- Primary color: #635bff
- Cards use 14px radius and soft lavender borders
- Buttons are pill-shaped
- Dashboards are compact with metric cards first
- Avoid gradients
```

When an artifact is created or edited, pi-artifacts injects the active design Markdown into the artifact guidance and records its fingerprint in `artifact.json`.

## Publishing

Default publishing target is `cloudflare-temporary`.

Temporary publishing deliberately runs Wrangler with an isolated temporary home directory and without Cloudflare API environment variables, so it creates a no-signup temporary preview account even if the host machine is already authenticated with Cloudflare. Temporary deployments expire after 60 minutes unless claimed.

Permanent publishing is still available explicitly with `target: "cloudflare-permanent"`.

Temporary Cloudflare limits are validated before publish: at most 1,000 files and 5 MiB per asset.

## Install locally

```bash
pi install ./path/to/pi-artifacts
```

Or test for one session:

```bash
pi -e ./path/to/pi-artifacts
```
