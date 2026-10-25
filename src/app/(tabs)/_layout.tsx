import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, type IconName } from '../../components/ui';

const TABS: [string, string, IconName][] = [
  ['index', 'Transactions', 'receipt'],
  ['stats', 'Stats', 'pie-chart'],
  ['accounts', 'Accounts', 'card'],
  ['loans', 'Loans', 'trending-down'],
  ['settings', 'Settings', 'settings'],
];

export default function TabLayout() {
  const ins = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.text,
        tabBarInactiveTintColor: C.dim,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.line, height: 62 + ins.bottom, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
        tabBarItemStyle: { paddingHorizontal: 0 },
      }}
    >
      {TABS.map(([name, title, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ focused }) => <Ionicons name={focused ? icon : (`${icon}-outline` as IconName)} size={22} color={focused ? C.accent : C.dim} />,
          }}
        />
      ))}
    </Tabs>
  );
}
