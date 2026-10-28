import type { LearningLanguage } from '../data/languages';

export const speechLanguages = {
  en: { locale: 'en-US', normal: 1, slow: 0.7 },
  ja: { locale: 'ja-JP', normal: 1, slow: 0.7 },
};
export type SpeechSpeed = 'normal' | 'slow';
export type SpeechState = { owner: string | null; error: string | null };
type Voice = { identifier: string; language: string };
type Options = { language: string; voice: string; rate: number; onDone: () => void; onStopped: () => void; onError: (error: Error) => void };
export type SpeechEngine = { stop: () => Promise<void>; getAvailableVoicesAsync: () => Promise<Voice[]>; speak: (text: string, options: Options) => void; maxSpeechInputLength: number };

export function sentences(text: string): string[] {
  return (text.match(/[^.!?。！？\n]+(?:[.!?。！？]+[”’"']*|$)|[^\n]+$/gm) ?? [text]).map((part) => part.trim()).filter(Boolean);
}

export function speechChunks(text: string, limit: number): string[] {
  const size = Math.max(2, Math.min(Number.isFinite(limit) ? limit : 3000, 3000));
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > size) {
    let end = remaining.lastIndexOf(' ', size);
    if (end < size / 2) end = size;
    // Do not split a UTF-16 surrogate pair.
    if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    chunks.push(remaining.slice(0, end)); remaining = remaining.slice(end).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function createSpeechController(engine: SpeechEngine, publish: (state: SpeechState) => void) {
  let generation = 0;
  let owner: string | null = null;
  let stopQueue: Promise<void> = Promise.resolve();
  function halt() {
    const job = stopQueue.catch(() => {}).then(() => engine.stop());
    stopQueue = job; return job;
  }
  async function stop(onlyOwner?: string) {
    if (onlyOwner && owner !== onlyOwner) return;
    const token = ++generation; owner = null; publish({ owner: null, error: null });
    try { await halt(); }
    catch { if (token === generation) publish({ owner: null, error: '음성을 중지하지 못했어요. 다시 시도해 주세요.' }); }
  }
  async function play(id: string, text: string, language: LearningLanguage, speed: SpeechSpeed) {
    const token = ++generation;
    owner = id; publish({ owner: id, error: null });
    const fail = (message: string) => {
      if (token !== generation) return;
      generation++;
      owner = null; publish({ owner: null, error: message });
      void halt().catch(() => {});
    };
    try {
      await halt();
      if (token !== generation) return;
      const config = speechLanguages[language];
      const voices = await engine.getAvailableVoicesAsync();
      if (token !== generation) return;
      const normalize = (value: string) => value.replace(/_/g, '-').toLowerCase();
      const voice = voices.find((v) => normalize(v.language) === normalize(config.locale))
        ?? voices.find((v) => normalize(v.language).split('-')[0] === language);
      if (!voice) { fail('기기에 해당 언어의 음성이 없어요. 기기의 텍스트 읽어주기 설정에서 언어 음성을 설치한 뒤 다시 시도해 주세요.'); return; }
      const chunks = speechChunks(text, engine.maxSpeechInputLength);
      function next(index: number) {
        if (token !== generation) return;
        if (index === chunks.length) { owner = null; publish({ owner: null, error: null }); return; }
        try {
          engine.speak(chunks[index], {
            language: voice!.language, voice: voice!.identifier, rate: config[speed],
            onDone: () => next(index + 1),
            onStopped: () => { if (token === generation) { generation++; owner = null; publish({ owner: null, error: null }); } },
            onError: () => fail('음성을 재생하지 못했어요. 음량과 기기의 음성 설정을 확인하고 다시 시도해 주세요.'),
          });
        } catch { fail('음성을 재생하지 못했어요. 기기의 음성 설정을 확인하고 다시 시도해 주세요.'); }
      }
      next(0);
    } catch { fail('음성을 준비하지 못했어요. 기기의 음성 설정을 확인하고 다시 시도해 주세요.'); }
  }
  return { play, stop };
}
