import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';
import { Loading } from '@/ui/kit';

/** Entry gate: pair a server first, then sign in or join, then the feed (WF-PAIR-1/2). */
export default function Index() {
  const s = useSession();
  if (!s.ready) return <Loading />;
  if (!s.instance) return <Redirect href="/pair" />;
  if (!s.signedIn) return <Redirect href={s.pendingInvite ? '/join' : '/login'} />;
  return <Redirect href="/(tabs)/feed" />;
}
