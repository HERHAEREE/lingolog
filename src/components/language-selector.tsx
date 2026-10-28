import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { languageLabels, type LearningLanguage } from '@/data/languages';
import { usePreferences } from '@/state/preferences-context';
import { ui } from './lingolog-ui';

export function LanguageSelector({ disabled = false, selectedLanguage, compact = false }: { disabled?: boolean; selectedLanguage?: LearningLanguage; compact?: boolean }) {
  const { preferences, isLoading, isSaving, error, selectLanguage, retryLoad } = usePreferences();
  const selected = selectedLanguage ?? preferences.learningLanguage;
  return (
    <View style={{ gap: 10 }}>
      {!compact && <Text style={ui.muted}>학습 언어 · 설명 언어는 한국어</Text>}
      {isLoading && <ActivityIndicator color="#326B55" />}
      <View style={ui.row}>
        {(['en', 'ja'] as LearningLanguage[]).map((language) => <Pressable key={language} accessibilityRole="radio"
          accessibilityState={{ selected: selected === language, disabled: disabled || isLoading || isSaving || !!error }}
          disabled={disabled || isLoading || isSaving || !!error} onPress={() => { void selectLanguage(language); }}
          style={[ui.secondaryButton, { borderRadius: 12, backgroundColor: selected === language ? '#EAF0E4' : '#FFFDF9' }]}>
          <Text style={ui.link}>{languageLabels[language]}{selected === language ? ' ✓' : ''}</Text>
        </Pressable>)}
      </View>
      {error && <><Text accessibilityRole="alert" style={ui.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { void retryLoad(); }} style={ui.secondaryButton}><Text style={ui.link}>언어 설정 다시 불러오기</Text></Pressable></>}
    </View>
  );
}
