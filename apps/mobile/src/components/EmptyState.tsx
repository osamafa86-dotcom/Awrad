import type { LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { useTheme } from '../lib/theme';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  body: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

/** A centred "nothing here yet" block: optional icon, title, body and one optional action. */
export function EmptyState({ title, body, icon: Icon, actionLabel, onAction }: EmptyStateProps) {
  const { colors, space, type } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: space.s12, paddingVertical: space.s32, paddingHorizontal: space.s16 }}>
      {Icon ? <Icon color={colors.textTertiary} size={40} strokeWidth={1.5} /> : null}
      <Text accessibilityRole="header" style={[type.titleMd, { color: colors.textPrimary, textAlign: 'center' }]}>
        {title}
      </Text>
      <Text style={[type.bodyMd, { color: colors.textSecondary, textAlign: 'center' }]}>{body}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} size="md" fullWidth={false} />
      ) : null}
    </View>
  );
}
