const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadModule } = require('./test-support/load-typescript.cjs');
const { createSpeechController, speechChunks, sentences } = loadModule(path.resolve(__dirname, '../src/speech/speech-controller.ts'));
function setup() {
  const states = [], calls = [], events = [];
  const engine = {
    maxSpeechInputLength: 12,
    async stop() { events.push('stop'); },
    async getAvailableVoicesAsync() { return [{ identifier: 'english', language: 'en-US' }, { identifier: 'japanese', language: 'ja_JP' }]; },
    speak(text, options) { events.push('speak'); calls.push({ text, options }); },
  };
  return { engine, states, calls, events, controller: createSpeechController(engine, (state) => states.push(state)) };
}
test('English and Japanese sentence controls preserve all sentences', () => {
  assert.deepEqual(sentences('Hello! How are you?\nFine.'), ['Hello!', 'How are you?', 'Fine.']);
  assert.deepEqual(sentences('今日は晴れです。楽しい！'), ['今日は晴れです。', '楽しい！']);
  const text = '😀'.repeat(20);
  const chunks = speechChunks(text, 7);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every((value) => value.length <= 7 && !/[\uD800-\uDBFF]$/.test(value)));
});
test('long texts advance only on completion and use language-specific rate and voice', async () => {
  const s = setup();
  await s.controller.play('diary', 'one two three four five six', 'en', 'slow');
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].options.rate, 0.7);
  assert.equal(s.calls[0].options.voice, 'english');
  let index = 0;
  while (index < s.calls.length) s.calls[index++].options.onDone();
  assert.ok(s.calls.length > 1);
  assert.equal(s.states.at(-1).owner, null);
  await s.controller.play('ja', 'こんにちは', 'ja', 'normal');
  assert.equal(s.calls.at(-1).options.voice, 'japanese');
  assert.equal(s.calls.at(-1).options.rate, 1);
});
test('new playback stops old speech; stale completion cannot enqueue more speech', async () => {
  const s = setup();
  await s.controller.play('old', 'a long old diary text with more chunks', 'en', 'normal');
  const old = s.calls[0].options;
  await s.controller.play('new', 'new', 'en', 'normal');
  old.onDone(); old.onStopped(); old.onError(new Error('late'));
  assert.equal(s.calls.length, 2);
  assert.equal(s.states.at(-1).owner, 'new');
  assert.deepEqual(s.events, ['stop', 'speak', 'stop', 'speak']);
  await s.controller.stop('old');
  assert.equal(s.states.at(-1).owner, 'new');
  await s.controller.stop('new');
  assert.equal(s.states.at(-1).owner, null);
});
test('leaving screen or background cancels pending voice lookup', async () => {
  const s = setup(); let resolve;
  s.engine.getAvailableVoicesAsync = () => new Promise((done) => { resolve = done; });
  const pending = s.controller.play('pending', 'hello', 'en', 'normal');
  await new Promise((done) => setImmediate(done));
  await s.controller.stop();
  resolve([{ identifier: 'voice', language: 'en-US' }]); await pending;
  assert.equal(s.calls.length, 0);
  assert.equal(s.states.at(-1).owner, null);
});
test('missing language voice gives guidance without speaking in another language', async () => {
  const s = setup(); s.engine.getAvailableVoicesAsync = async () => [{ identifier: 'ko', language: 'ko-KR' }];
  await s.controller.play('missing', 'hello', 'en', 'normal');
  assert.equal(s.calls.length, 0);
  assert.match(s.states.at(-1).error, /음성이 없어요/);
});
test('native error cancels further chunks; synchronous failures are also reported', async () => {
  const s = setup();
  await s.controller.play('error', 'long text requiring many chunks', 'en', 'normal');
  const callback = s.calls[0].options;
  callback.onError(new Error('failed')); callback.onDone();
  assert.equal(s.calls.length, 1);
  assert.match(s.states.at(-1).error, /재생하지 못했어요/);
  s.engine.speak = () => { throw new Error('native failure'); };
  await s.controller.play('throw', 'hello', 'en', 'normal');
  assert.match(s.states.at(-1).error, /재생하지 못했어요/);
});
test('simultaneous starts only speak the latest request', async () => {
  const s = setup();
  await Promise.all([s.controller.play('a', 'a', 'en', 'normal'), s.controller.play('b', 'b', 'ja', 'slow')]);
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].text, 'b');
});
