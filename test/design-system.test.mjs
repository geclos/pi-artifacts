import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureArtifactScaffold, readMetadata } from '../src/store/artifactStore.ts';
import { resolveDesignSystem } from '../src/design/resolveDesignSystem.ts';

test('project DESIGN.md is resolved and recorded in artifact metadata', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-artifacts-design-'));
  try {
    await mkdir(join(cwd, '.pi/artifacts'), { recursive: true });
    await writeFile(join(cwd, '.pi/artifacts/DESIGN.md'), '# Acme Design\n\n- Primary color: #635bff\n', 'utf8');
    const design = await resolveDesignSystem(cwd);
    assert.equal(design?.scope, 'project');
    assert.equal(design?.displayPath, '.pi/artifacts/DESIGN.md');
    assert.match(design?.content || '', /Acme Design/);
    const created = await ensureArtifactScaffold(cwd, { title: 'Custom Design Artifact' });
    const meta = await readMetadata(cwd, created.id);
    assert.equal(meta.designSystem?.scope, 'project');
    assert.equal(meta.designSystem?.path, '.pi/artifacts/DESIGN.md');
    assert.match(meta.designSystem?.fingerprint || '', /^sha256-/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
