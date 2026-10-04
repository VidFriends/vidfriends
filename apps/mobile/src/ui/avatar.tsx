import type { PublicUser } from '@vidfriends/contracts';
import { Text, View } from 'react-native';
import { useTheme } from './theme';

/**
 * Decorative initial avatar (the name is always shown next to it). Profile pictures are served by
 * a 302 to a presigned URL; a bearer header carried across that same-host redirect would break the
 * signature, so the app shows initials until the API offers a direct URL.
 */
export function Avatar({ user, size = 36 }: { user: PublicUser; size?: number }) {
  const theme = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.card,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: theme.primary, fontWeight: '700' }}>
        {(user.display_name || user.username).slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}
