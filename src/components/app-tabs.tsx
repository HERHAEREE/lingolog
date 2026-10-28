import { Tabs } from 'expo-router';
import { Text } from 'react-native';

const tabs = [
  { name: 'index', title: '홈', icon: '⌂' },
  { name: 'diary', title: '일기', icon: '✎' },
  { name: 'vocabulary', title: '단어장', icon: 'Aa' },
  { name: 'settings', title: '설정', icon: '⚙' },
];

export default function AppTabs() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#326B55', tabBarInactiveTintColor: '#7B817B', tabBarStyle: { backgroundColor: '#FFFDF9', borderTopColor: '#E5E7DD' }, tabBarLabelStyle: { fontSize: 12 }, tabBarHideOnKeyboard: true }}>
      {tabs.map(({ name, title, icon }) => (
        <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 23, fontWeight: '600' }}>{icon}</Text> }} />
      ))}
    </Tabs>
  );
}
