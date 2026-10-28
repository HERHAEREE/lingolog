import { sampleEntries, type DiaryEntry } from '../data/diary-model';
import type { CorrectionResult, CorrectionService } from './correction-service';

const results: Record<string, Pick<CorrectionResult, 'source' | 'diaryId' | 'learningLanguage' | 'original' | 'corrected' | 'changes'>> = {
  'sample-1': {
    source: 'sample', diaryId: 'sample-1', learningLanguage: 'en',
    original: sampleEntries[0].content,
    corrected: 'Today I went for a walk in the park. The air was fresh, and the sky was clear. A small dog ran past me and made me smile. I felt thankful for this peaceful moment.',
    changes: [
      {
        id: 'sample-1-walk', kind: 'natural', learningType: 'expression',
        expression: 'go for a walk', meaning: '산책하러 가다',
        originalSentence: 'Today I took a walk in the park.',
        correctedSentence: 'Today I went for a walk in the park.',
        explanation: 'took a walk도 올바른 표현이에요. 일상적인 산책을 말할 때 go for a walk라는 표현도 쓸 수 있어요. 지난 일을 이야기하므로 go의 과거형 went를 사용했어요.',
      },
      {
        id: 'sample-1-thankful', kind: 'natural', learningType: 'word',
        expression: 'thankful', meaning: '감사하는',
        originalSentence: 'I felt grateful for this peaceful moment.',
        correctedSentence: 'I felt thankful for this peaceful moment.',
        explanation: 'grateful은 원래 문장에서 잘 쓰였어요. thankful은 감사하는 마음을 나타내는 또 다른 단어예요. 오류 수정이 아니라 어휘 선택의 대안이며, thankful for 뒤에는 감사하는 대상을 써요.',
      },
    ],
  },
  'sample-2': {
    source: 'sample', diaryId: 'sample-2', learningLanguage: 'en',
    original: sampleEntries[1].content,
    corrected: "I tried a new recipe for dinner. Although it wasn't perfect, I enjoyed cooking. Next time, I'd like to share this meal with a friend.",
    changes: [
      {
        id: 'sample-2-although', kind: 'natural', learningType: 'grammar',
        expression: 'Although + 주어 + 동사', meaning: '비록 ~이지만: 양보절로 두 내용을 연결하는 문법',
        originalSentence: 'It was not perfect, but I enjoyed cooking.',
        correctedSentence: "Although it wasn't perfect, I enjoyed cooking.",
        explanation: '원문의 but 연결은 문법적으로 올바릅니다. Although로 시작하는 양보절을 사용하면 완벽하지 않았어도 요리를 즐겼다는 뜻을 강조할 수 있어요. 앞의 양보절 뒤에 쉼표를 쓰고, 같은 절에 but을 함께 쓰지 않아요.',
      },
      {
        id: 'sample-2-like', kind: 'natural', learningType: 'expression',
        expression: 'would like to + 동사', meaning: '~하고 싶다: 바람을 부드럽게 말하는 표현',
        originalSentence: 'Next time, I want to share this meal with a friend.',
        correctedSentence: "Next time, I'd like to share this meal with a friend.",
        explanation: 'want to도 올바른 표현이에요. would like to는 바람을 조금 더 부드럽게 표현하는 대안이에요. I would는 I’d로 줄일 수 있고 to 뒤에는 동사원형 share를 써요.',
      },
    ],
  },
};

export function supportsSampleCorrection(entry: DiaryEntry) {
  const result = results[entry.sampleTemplateId ?? entry.id];
  return entry.sample === true && !!result && entry.learningLanguage === result.learningLanguage && entry.content === result.original;
}

export const sampleCorrectionService: CorrectionService = {
  async correct(entry, explanationLanguage = 'ko') {
    if (entry.learningLanguage === 'ja') return { status: 'unsupported', message: '일본어 교정은 아직 지원하지 않아요. 일본어 일기 저장과 듣기는 이용할 수 있어요. 실제 교정 API는 연결하지 않았습니다.' };
    if (!supportsSampleCorrection(entry)) {
      return { status: 'unsupported', message: '현재는 원문이 그대로인 샘플 일기 두 개만 교정 예시를 제공해요. 직접 작성한 일기나 수정한 샘플의 교정은 실제 교정 기능을 연결한 뒤 지원할 예정이에요.' };
    }
    const result = results[entry.sampleTemplateId ?? entry.id];
    return { status: 'available', result: { ...result, diaryId: entry.id, originalVersion: entry.revision ?? 0,
      originalUpdatedAt: entry.updatedAt, explanationLanguage, correctedAt: new Date().toISOString(),
      changes: result.changes.map((change) => ({ ...change })),
      learningItems: result.changes.map((change) => ({ id: change.id, type: change.learningType, expression: change.expression,
        meaning: change.meaning, originalSentence: change.originalSentence, correctedExample: change.correctedSentence })),
    } };
  },
};
