// Push titles in the member's language (NFR-I18N-01): the only texts the server writes for people.
// BR-NOT-3: titles name the actor and the kind of event, never content.
import type { Language, NotificationType } from '@vidfriends/contracts';

const TEXT = {
  en: {
    share_received: (a: string, n: number) =>
      n > 1 ? `${a} sent you ${n} videos` : `New video from ${a}`,
    reaction_received: (a: string) => `${a} reacted to your video`,
    reply_received: (a: string) => `New reply from ${a}`,
    friend_request_received: (a: string) => `${a} wants to be friends`,
    friend_request_accepted: (a: string) => `${a} accepted your friend request`,
    share_watched: (a: string) => `${a} watched your video`,
    someone: 'Someone',
    private: 'New activity on VidFriends',
    test: 'Test notification from VidFriends',
  },
  es: {
    share_received: (a: string, n: number) =>
      n > 1 ? `${a} te envió ${n} videos` : `Nuevo video de ${a}`,
    reaction_received: (a: string) => `${a} reaccionó a tu video`,
    reply_received: (a: string) => `Nueva respuesta de ${a}`,
    friend_request_received: (a: string) => `${a} quiere ser tu amigo`,
    friend_request_accepted: (a: string) => `${a} aceptó tu solicitud de amistad`,
    share_watched: (a: string) => `${a} vio tu video`,
    someone: 'Alguien',
    private: 'Nueva actividad en VidFriends',
    test: 'Notificación de prueba de VidFriends',
  },
} as const;

const pick = (lang: string | null | undefined) => TEXT[lang === 'es' ? 'es' : 'en'];

export function pushTitle(
  lang: Language | string | null | undefined,
  type: NotificationType,
  actor: string | null,
  count = 1,
): string {
  const t = pick(lang);
  return t[type](actor ?? t.someone, count);
}

export const privateTitle = (lang: Language | string | null | undefined) => pick(lang).private;
export const testTitle = (lang: Language | string | null | undefined) => pick(lang).test;
