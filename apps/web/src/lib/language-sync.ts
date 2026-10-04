// NFR-I18N-01: the server writes push titles in the member's language, so the signed-in app tells
// it which language is in use (the browser's, or the one picked in Settings).
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '@vidfriends/api-client/react';
import { getMe, updateMe, type Language, type SelfUser } from '@vidfriends/contracts';
import { useEffect } from 'react';
import i18n from '@/i18n';

export function useLanguageSync(user: SelfUser | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!user) return;
    const sync = (lng: string) => {
      const language = (lng === 'es' ? 'es' : 'en') as Language;
      if (language === user.language) return;
      void api
        .call(updateMe, { body: { language } })
        .then(() => queryClient.invalidateQueries({ queryKey: [getMe.id] }))
        .catch(() => {});
    };
    sync(i18n.language);
    i18n.on('languageChanged', sync);
    return () => i18n.off('languageChanged', sync);
  }, [api, queryClient, user]);
}
