// NFR-I18N-01: the server writes push titles in the member's language, so the signed-in app tells
// it which language is in use (the phone's, or the one picked in Settings).
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from '@vidfriends/api-client/react';
import { getMe, updateMe, type Language } from '@vidfriends/contracts';
import { useEffect } from 'react';
import i18n from '@/i18n';
import { useSession } from '@/lib/session';

export function LanguageSync() {
  const session = useSession();
  const queryClient = useQueryClient();
  const me = useApiQuery(getMe, {}, { enabled: session.signedIn });
  const current = me.data?.user.language;
  useEffect(() => {
    if (!session.signedIn || !current) return;
    const sync = (lng: string) => {
      const language: Language = lng === 'es' ? 'es' : 'en';
      if (language === current) return;
      void session.api
        .call(updateMe, { body: { language } })
        .then(() => queryClient.invalidateQueries({ queryKey: [getMe.id] }))
        .catch(() => {});
    };
    sync(i18n.language);
    i18n.on('languageChanged', sync);
    return () => i18n.off('languageChanged', sync);
  }, [session.signedIn, session.api, current, queryClient]);
  return null;
}
