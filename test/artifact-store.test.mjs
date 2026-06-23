import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { ensureArtifactScaffold, buildDist } from '../src/store/artifactStore.ts';
import { validateArtifact } from '../src/tools/validate.ts';

test('create, build, and validate a local artifact', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-artifacts-'));
  try {
    const created = await ensureArtifactScaffold(cwd, { title: 'Demo Artifact', kind: 'report' });
    assert.equal(created.id, 'demo-artifact');
    assert.ok(existsSync(join(cwd, '.pi/artifacts/demo-artifact/source/index.html')));
    await buildDist(cwd, created.id);
    assert.ok(existsSync(join(cwd, '.pi/artifacts/demo-artifact/dist/thumbnail.svg')));
    const validation = await validateArtifact(cwd, created.id, true);
    assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
