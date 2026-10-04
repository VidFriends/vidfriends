import { useApiQuery } from '@vidfriends/api-client/react';
import { getAvatarUrl, type PublicUser } from '@vidfriends/contracts';
import { Image, Text, View } from 'react-native';
import { useTheme } from './theme';

/**
 * Decorative avatar (the name is always shown next to it). The signed URL is fetched as data
 * (`GET /users/{id}/avatar-url`) so the bearer token never travels to the object store; the
 * initial shows while it loads or when there is no picture.
 */
export function Avatar({ user, size = 36 }: { user: PublicUser; size?: number }) {
  const theme = useTheme();
  const signed = useApiQuery(
    getAvatarUrl,
    { params: { user_id: user.id } },
    // avatar_url changes (?v=) whenever the picture does; signed URLs live 15 minutes.
    { enabled: Boolean(user.avatar_url), staleTime: 10 * 60_000 },
  );
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (user.avatar_url && signed.data) {
    return (
      <Image
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        source={{ uri: signed.data.url }}
        style={style}
      />
    );
  }
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        style,
        { backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' },
      ]}
    >
      <Text style={{ color: theme.primary, fontWeight: '700' }}>
        {(user.display_name || user.username).slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}
