import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { themeFor } from '@/data/city-themes';
import { languageLabels, type LearningLanguage } from '@/data/languages';
import { growthStages } from '@/growth/growth-model';
import { HouseGraphic } from './house-graphic';
import { ui } from './lingolog-ui';

// Preview owns only temporary UI state; it never changes preferences or earned rewards.
export function HouseGrowthPreview({ initialLanguage }: { initialLanguage: LearningLanguage }) {
  const [language, setLanguage] = useState(initialLanguage);
  const [stage, setStage] = useState(growthStages.length - 1);
  const theme = themeFor(language)!;
  return <View style={{ gap: 14 }}>
    <Text style={ui.sectionTitle}>집 성장 시뮬레이션</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {(['en', 'ja'] as const).map((value) => <Pressable key={value} accessibilityRole="button"
        accessibilityState={{ selected: language === value }} style={ui.secondaryButton} onPress={() => setLanguage(value)}>
        <Text style={ui.link}>{language === value ? '✓ ' : ''}{languageLabels[value]} · {themeFor(value)!.city}</Text>
      </Pressable>)}
    </View>
    <HouseGraphic stage={stage} theme={theme} />
    <Text accessibilityLiveRegion="polite" style={ui.sectionTitle}>{growthStages[stage].days}일 · {growthStages[stage].name}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {growthStages.map((value, index) => <Pressable key={value.days} accessibilityRole="button"
        accessibilityLabel={`${value.days}일 ${value.name} 미리 보기`} accessibilityState={{ selected: stage === index }}
        style={ui.secondaryButton} onPress={() => setStage(index)}>
        <Text style={ui.link}>{stage === index ? '✓ ' : ''}{value.days}일</Text>
      </Pressable>)}
    </View>
    <Text style={ui.muted}>미리 보기예요. 실제 작성일과 보상은 바뀌지 않아요.</Text>
  </View>;
}
