import { useApiQuery } from '@vidfriends/api-client/react';
import { unreadCount } from '@vidfriends/contracts';
import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Screen } from '@/ui/kit';

export default function More() {
  const { t } = useTranslation();
  const unread = useApiQuery(unreadCount).data?.count ?? 0;
  const links: [string, Href][] = [
    [
      unread ? t('nav.notificationsCount', { count: unread }) : t('notifications.title'),
      '/notifications',
    ],
    [t('lists.saved'), '/saved'],
    [t('lists.history'), '/history'],
    [t('lists.sent'), '/sent'],
    [t('offline.title'), '/downloads'],
    [t('settings.title'), '/settings'],
  ];
  return (
    <Screen edges={[]}>
      {links.map(([label, href]) => (
        <Button
          key={String(href)}
          label={label}
          variant="secondary"
          onPress={() => router.push(href)}
        />
      ))}
    </Screen>
  );
}
