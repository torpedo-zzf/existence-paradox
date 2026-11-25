import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStagingObjectKey,
  sanitizeStagingReceipt,
  stageAssetToPrivateOss
} from '../../providers/oss/oss-staging.mjs';

const VALID_SHA = 'a'.repeat(64);

test('OSS-207: builds deduplicated scoped object key and rejects unsupported extensions', () => {
  assert.equal(
    buildStagingObjectKey('staging/existence-paradox/', VALID_SHA, '.png'),
    `staging/existence-paradox/${VALID_SHA}.png`
  );
  assert.equal(
    buildStagingObjectKey('staging/existence-paradox', VALID_SHA, 'wav'),
    `staging/existence-paradox/${VALID_SHA}.wav`
  );
  assert.throws(() => buildStagingObjectKey('staging/existence-paradox/', VALID_SHA, '.exe'));
  assert.throws(() => buildStagingObjectKey('staging/existence-paradox/', 'badhash', '.png'));
});

test('OSS-207: strips signed_url from persisted receipts and blocks unapproved uploads', () => {
  const receipt = sanitizeStagingReceipt({
    ok: true,
    object_key: `staging/existence-paradox/${VALID_SHA}.png`,
    sha256: VALID_SHA,
    signed_url: 'https://example.com/secret?Signature=abc'
  });
  assert.equal('signed_url' in receipt, false);
  assert.equal(receipt.sha256, VALID_SHA);

  assert.throws(() => stageAssetToPrivateOss({
    localPath: 'assets/inbox/CHAR-002/CHAR-002-r1.png',
    approved: false
  }));
});

test('OSS-207: mock staging adapter returns sanitized receipt and ephemeral HTTPS URL', () => {
  const out = stageAssetToPrivateOss({
    localPath: 'assets/inbox/CHAR-002/CHAR-002-r1.png',
    approved: true,
    execute: () => ({
      status: 0,
      stdout: JSON.stringify({
        ok: true,
        object_key: `staging/existence-paradox/${VALID_SHA}.png`,
        sha256: VALID_SHA,
        size_bytes: 1234,
        mime_type: 'image/png',
        deduplicated: false,
        ttl_seconds: 7200,
        reachability_http_status: 206,
        signed_url: 'https://cdn.example.com/staging/obj.png?Expires=123&Signature=xyz'
      })
    })
  });
  assert.equal('signed_url' in out.receipt, false);
  assert.equal(out.receipt.reachability_http_status, 206);
  assert.ok(out.ephemeralSignedUrl.startsWith('https://'));
});
