import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMetasoPayload,
  submitMetasoVideoJob,
  pollMetasoVideoJob,
  METASO_DEFAULT_BASE_URL
} from '../../providers/video/metaso-h3.mjs';

test('VID-203: enforces native H3 schema rules and rejects first_frame + reference_audio mixing', () => {
  const ambient = buildMetasoPayload({
    prompt: 'Calm dawn bedroom',
    resolution: '768P',
    duration: 5,
    audioMode: 'native_ambience',
    firstFrameUrl: 'https://cdn.example.com/kf.png'
  });
  assert.equal(ambient.model, 'MiniMax-H3');
  assert.equal(ambient.content[1].role, 'first_frame');

  const speaking = buildMetasoPayload({
    prompt: 'Lin speaks',
    resolution: '768P',
    duration: 10,
    audioMode: 'native_reference_dialogue',
    referenceImageUrls: ['https://cdn.example.com/char.png'],
    referenceAudioUrls: ['https://cdn.example.com/voice.wav']
  });
  assert.equal(speaking.content[1].role, 'reference_image');
  assert.equal(speaking.content[2].role, 'reference_audio');

  assert.throws(() => buildMetasoPayload({
    prompt: 'Illegal mix',
    firstFrameUrl: 'https://cdn.example.com/kf.png',
    referenceAudioUrls: ['https://cdn.example.com/voice.wav']
  }));
});

test('VID-203: blocks unapproved submission and non-Metaso endpoints', async () => {
  const payload = buildMetasoPayload({ prompt: 'Test', duration: 5 });
  await assert.rejects(() => submitMetasoVideoJob({
    apiKey: 'fake',
    payload,
    assetId: 'TEST',
    approved: false
  }));
  await assert.rejects(() => submitMetasoVideoJob({
    baseUrl: 'https://api.minimax.chat',
    apiKey: 'fake',
    payload,
    assetId: 'TEST',
    approved: true
  }));
});

test('VID-203: mock submit + bounded poll succeeds without leaking secrets', async () => {
  const payload = buildMetasoPayload({
    prompt: 'Test shot',
    resolution: '768P',
    duration: 5,
    referenceImageUrls: ['https://cdn.example.com/ref.png?Signature=SECRET']
  });

  const submitted = await submitMetasoVideoJob({
    baseUrl: METASO_DEFAULT_BASE_URL,
    apiKey: 'mock-key',
    payload,
    assetId: 'EP01-S01-VID01',
    approved: true,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ task: { id: '999001', status: 'queued' } })
    })
  });
  assert.equal(submitted.taskId, '999001');
  assert.equal(JSON.stringify(submitted.receipt).includes('SECRET'), false);

  let polls = 0;
  const polled = await pollMetasoVideoJob({
    apiKey: 'mock-key',
    taskId: '999001',
    maxPolls: 3,
    intervalMs: 1,
    sleepImpl: async () => {},
    fetchImpl: async () => {
      polls += 1;
      if (polls < 2) return { ok: true, status: 200, json: async () => ({ task: { id: '999001', status: 'running' } }) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          task: {
            id: '999001',
            status: 'succeeded',
            content: { url: 'https://cdn.example.com/out.mp4' },
            usage: { output_seconds: 5 }
          }
        })
      };
    }
  });
  assert.equal(polled.status, 'succeeded');
  assert.equal(polled.usage.output_seconds, 5);
});
