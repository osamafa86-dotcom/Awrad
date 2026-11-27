import { Tabs } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
// Per-icon imports keep the web bundle from pulling in the whole icon set.
import CalendarCheck from 'lucide-react-native/icons/calendar-check';
import CalendarRange from 'lucide-react-native/icons/calendar-range';
import ChartColumn from 'lucide-react-native/icons/chart-column';
import History from 'lucide-react-native/icons/history';
import Settings from 'lucide-react-native/icons/settings';

import { useTheme } from '../../src/lib/theme';
import { ar } from '../../src/messages/ar';

type TabName = keyof typeof ar.tabs;

/** The five tabs in reading order (first = right-most in RTL), as in Figma's TabBar. */
export const TABS: readonly { name: TabName; icon: LucideIcon }[] = [
  { name: 'today', icon: CalendarCheck },
  { name: 'weekly', icon: CalendarRange },
  { name: 'summary', icon: ChartColumn },
  { name: 'history', icon: History },
  { name: 'settings', icon: Settings },
];

const ICON_SIZE = 24;
const ICON_STROKE = 1.75;

export default function TabLayout() {
  const { colors, type } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.actionPrimary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.bgSurface, borderTopColor: colors.borderSubtle },
        tabBarLabelStyle: { fontFamily: type.labelSm.fontFamily, fontSize: type.labelSm.fontSize },
      }}
    >
      {TABS.map(({ name, icon: Icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: ar.tabs[name],
            tabBarAccessibilityLabel: ar.tabs[name],
            tabBarIcon: ({ color }) => <Icon color={color} size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
          }}
        />
      ))}
    </Tabs>
  );
}
