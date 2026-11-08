import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';

export type TabType = 'home' | 'albums' | 'favorites' | 'search' | 'settings';

type TabItem = {
  id: TabType;
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
};

const PILL_TABS: TabItem[] = [
  {
    id: 'home',
    label: 'Per te',
    activeIcon: 'sparkles',
    inactiveIcon: 'sparkles-outline',
  },
  {
    id: 'albums',
    label: 'Album',
    activeIcon: 'albums',
    inactiveIcon: 'albums-outline',
  },
  {
    id: 'favorites',
    label: 'Preferiti',
    activeIcon: 'heart',
    inactiveIcon: 'heart-outline',
  },
  {
    id: 'settings',
    label: 'Server',
    activeIcon: 'settings',
    inactiveIcon: 'settings-outline',
  },
];

type Props = {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
};

export const MobileTabBar: React.FC<Props> = ({ activeTab, onTabChange }) => {
  const insets = useSafeAreaInsets();

  const handlePress = (tab: TabType) => {
    if (tab !== activeTab) {
      void Haptics.selectionAsync().catch(() => undefined);
      onTabChange(tab);
    }
  };

  const isSearchActive = activeTab === 'search';

  return (
    <View
      style={[
        styles.tabBar,
        {
          paddingBottom: Math.max(10, insets.bottom),
        },
      ]}
    >
      <View style={styles.pill}>
        {PILL_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[styles.pillItem, isActive && styles.pillItemActive]}
              onPress={() => handlePress(tab.id)}
            >
              <Ionicons
                name={isActive ? tab.activeIcon : tab.inactiveIcon}
                size={22}
                color={isActive ? theme.colors.tint : theme.colors.textMuted}
              />
              <Text
                style={[styles.pillLabel, isActive && styles.pillLabelActive]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={[styles.searchBtn, isSearchActive && styles.searchBtnActive]}
        onPress={() => handlePress('search')}
        accessibilityLabel="Cerca"
      >
        <Ionicons
          name="search"
          size={22}
          color={isSearchActive ? theme.colors.tint : theme.colors.textPrimary}
        />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  pill: {
    flex: 1,
    maxWidth: 320,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(38, 38, 44, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 999,
    padding: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  pillItem: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 999,
  },
  pillItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  pillLabel: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#9a9aa4',
    lineHeight: 12,
    marginTop: 3,
  },
  pillLabelActive: {
    color: theme.colors.tint,
    fontWeight: '700',
  },
  searchBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(38, 38, 44, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  searchBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(250, 36, 60, 0.3)',
  },
});
