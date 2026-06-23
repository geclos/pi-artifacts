import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWranglerOutput } from '../src/cloudflare/parseWranglerOutput.ts';

test('parse wrangler temporary output', () => {
  const output = `Temporary account ready:\n  Account: example-name (created)\n  Claim within: 60 minutes\n  Claim URL: https://dash.cloudflare.com/claim-preview?claimToken=TOKEN\nUploaded example-worker\nDeployed example-worker triggers\n  https://example-worker.example-name.workers.dev`;
  assert.deepEqual(parseWranglerOutput(output), {
    account: 'example-name (created)',
    claimUrl: 'https://dash.cloudflare.com/claim-preview?claimToken=TOKEN',
    url: 'https://example-worker.example-name.workers.dev'
  });
});
