import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { ensureArtifactScaffold, buildDist } from '../src/store/artifactStore.ts';
import { validateArtifact } from '../src/tools/validate.ts';

test('create, build, and validate a markdown artifact', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-artifacts-md-'));
  try {
    const created = await ensureArtifactScaffold(cwd, { title: 'MD Artifact', format: 'md' });
    assert.equal(created.id, 'md-artifact');
    assert.ok(existsSync(join(cwd, '.pi/artifacts/md-artifact/source/index.md')));
    await buildDist(cwd, created.id);
    assert.ok(existsSync(join(cwd, '.pi/artifacts/md-artifact/dist/index.md')));
    const validation = await validateArtifact(cwd, created.id, true);
    assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
