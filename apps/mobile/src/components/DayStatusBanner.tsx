import type { LucideIcon } from 'lucide-react-native';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import FilePen from 'lucide-react-native/icons/file-pen';
import Lock from 'lucide-react-native/icons/lock';
import WifiOff from 'lucide-react-native/icons/wifi-off';
import { useEffect } from 'react';
import { AccessibilityInfo, Platform, Pressable, Text, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { ar } from '../messages/ar';

export type BannerKind = 'achieved' | 'failed' | 'neutral' | 'error' | 'readOnly' | 'draft';

export interface DayStatusBannerProps {
  state: BannerKind;
  completionPct?: number | null;
  /** `failed`: habits still short of done. */
  remaining?: number;
  /** `error`: the translated error message. */
  message?: string;
  /** `error`: no connection — shows the offline icon. */
  offline?: boolean;
  onRetry?(): void;
  /** Weekly review wording for the saved states; defaults to the daily one. */
  period?: 'daily' | 'weekly';
}

/**
 * DESIGN.md §6 DayStatusBanner: achieved · remaining items · save failed · read only — one sentence each; plus
 * «مسوّدة غير محفوظة» for edits restored from this device (final review mobile I4), in the neutral tokens.
 */
export function DayStatusBanner({
  state,
  remaining = 0,
  message,
  offline,
  onRetry,
  period = 'daily',
}: DayStatusBannerProps) {
  const { colors, radius, space, type } = useTheme();

  const look: { bg: string; fg: string; icon: LucideIcon; title: string; body?: string } = (() => {
    switch (state) {
      case 'achieved': // a completed day: gold is allowed (§2)
        return {
          bg: colors.goldTint,
          fg: colors.goldText,
          icon: CircleCheck,
          title: period === 'weekly' ? ar.weekly.banner.achieved : ar.today.banner.achieved,
        };
      case 'failed':
        return {
          bg: colors.actionPrimaryTint,
          fg: colors.textLink,
          icon: CircleCheck,
          title:
            period === 'weekly'
              ? ar.weekly.banner.failed(remaining)
              : ar.today.banner.failed(remaining),
          body: ar.today.banner.failedBody,
        };
      case 'neutral':
        return {
          bg: colors.statusNeutralTint,
          fg: colors.statusNeutral,
          icon: CircleCheck,
          title: period === 'weekly' ? ar.weekly.banner.neutral : ar.today.banner.neutral,
        };
      case 'error':
        return {
          bg: colors.statusNotdoneTint,
          fg: colors.statusNotdone,
          icon: offline ? WifiOff : CircleAlert,
          title: ar.today.banner.errorTitle,
          body: message,
        };
      case 'draft':
        return {
          bg: colors.statusNeutralTint,
          fg: colors.statusNeutral,
          icon: FilePen,
          title: ar.today.banner.draftTitle,
          body: ar.today.banner.draftBody,
        };
      case 'readOnly':
        return {
          bg: colors.bgSunken,
          fg: colors.textSecondary,
          icon: Lock,
          title: ar.today.banner.readOnly,
          body: period === 'weekly' ? ar.weekly.banner.readOnlyBody : ar.today.banner.readOnlyBody,
        };
    }
  })();
  const Icon = look.icon;
  const announcement = look.body ? `${look.title}. ${look.body}` : look.title;

  // iOS VoiceOver ignores accessibilityLiveRegion (Android-only): announce new banners explicitly.
  useEffect(() => {
    if (Platform.OS === 'ios' && state !== 'readOnly') {
      AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [announcement, state]);

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={state === 'error' ? 'alert' : undefined}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.s12,
        padding: space.s16,
        borderRadius: radius.lg,
        backgroundColor: look.bg,
      }}
    >
      <Icon color={look.fg} size={22} strokeWidth={1.75} />
      <View style={{ flex: 1, gap: space.s4 }}>
        <Text style={[type.titleMd, { color: state === 'error' ? look.fg : colors.textPrimary }]}>
          {look.title}
        </Text>
        {look.body ? (
          <Text style={[type.bodySm, { color: colors.textSecondary }]}>{look.body}</Text>
        ) : null}
      </View>
      {state === 'error' && onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ar.today.banner.retry}
          onPress={onRetry}
          hitSlop={12}
          style={{ minHeight: 32, justifyContent: 'center' }}
        >
          <Text style={[type.labelSm, { color: colors.statusNotdone }]}>
            {ar.today.banner.retry}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
