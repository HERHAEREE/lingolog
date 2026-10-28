import { Screen } from '@/components/lingolog-ui';
import { LanguageSelector } from '@/components/language-selector';
import { HomeHouse } from '@/components/home-house';
import { TodaysQuestion } from '@/components/todays-question';
import { usePreferences } from '@/state/preferences-context';

export default function HomeScreen() {
  const preferences = usePreferences();
  return <Screen>
    <LanguageSelector compact />
    {!preferences.isLoading && !preferences.error && <><HomeHouse /><TodaysQuestion /></>}
  </Screen>;
}
