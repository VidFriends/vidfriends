// Friends (FR-FRND-01..05): search, requests in and out, friends, blocks.
import { useQueryClient } from '@tanstack/react-query';
import { useApiMutation, useApiQuery } from '@vidfriends/api-client/react';
import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  declineFriendRequest,
  listBlocks,
  listFriendRequests,
  listFriends,
  removeFriend,
  searchUsers,
  sendFriendRequest,
  unblockUser,
  type Relationship,
} from '@vidfriends/contracts';
import { useDeferredValue, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { errorText } from '@/i18n';
import { Avatar } from '@/ui/avatar';
import { Body, Button, ErrorBox, Field, Screen } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function Friends() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const search = useDeferredValue(q.trim());
  const [error, setError] = useState<string | null>(null);
  const results = useApiQuery(
    searchUsers,
    { query: { q: search } },
    { enabled: search.length >= 2 },
  );
  const incoming = useApiQuery(listFriendRequests, { query: { direction: 'in' } });
  const outgoing = useApiQuery(listFriendRequests, { query: { direction: 'out' } });
  const friends = useApiQuery(listFriends);
  const blocks = useApiQuery(listBlocks);
  const refresh = () => qc.invalidateQueries();
  const opts = { onSuccess: refresh, onError: (e: unknown) => setError(errorText(e)) };
  const request = useApiMutation(sendFriendRequest, opts);
  const accept = useApiMutation(acceptFriendRequest, opts);
  const decline = useApiMutation(declineFriendRequest, opts);
  const cancel = useApiMutation(cancelFriendRequest, opts);
  const remove = useApiMutation(removeFriend, opts);
  const block = useApiMutation(blockUser, opts);
  const unblock = useApiMutation(unblockUser, opts);
  const p = (r: Relationship) => ({ params: { user_id: r.user.id } });

  return (
    <Screen edges={[]}>
      <ErrorBox message={error} />
      <Field
        label={t('friends.search')}
        value={q}
        onChangeText={setQ}
        autoCapitalize="none"
        autoCorrect={false}
        testID="friends-search"
      />
      {search.length >= 2 ? (
        <Section title={t('friends.results')}>
          {(results.data?.items ?? []).map((r) => (
            <Row key={r.user.id} rel={r}>
              {r.state === 'none' ? (
                <Button
                  label={t('friends.add')}
                  onPress={() => request.mutate({ body: { user_id: r.user.id } })}
                />
              ) : (
                <Body muted>{t(`friends.state.${r.state}`)}</Body>
              )}
            </Row>
          ))}
        </Section>
      ) : null}
      <Section title={t('friends.incoming')}>
        {(incoming.data?.items ?? []).map((r) => (
          <Row key={r.user.id} rel={r}>
            <Button label={t('friends.accept')} onPress={() => accept.mutate(p(r))} />
            <Button
              label={t('friends.decline')}
              variant="secondary"
              onPress={() => decline.mutate(p(r))}
            />
          </Row>
        ))}
      </Section>
      <Section title={t('friends.outgoing')}>
        {(outgoing.data?.items ?? []).map((r) => (
          <Row key={r.user.id} rel={r}>
            <Button
              label={t('friends.cancel')}
              variant="secondary"
              onPress={() => cancel.mutate(p(r))}
            />
          </Row>
        ))}
      </Section>
      <Section title={t('friends.friends')} empty={t('friends.noFriends')}>
        {(friends.data?.items ?? []).map((r) => (
          <Row key={r.user.id} rel={r}>
            <Button
              label={t('friends.remove')}
              variant="secondary"
              onPress={() => remove.mutate(p(r))}
            />
            <Button
              label={t('friends.block')}
              variant="danger"
              onPress={() => block.mutate(p(r))}
            />
          </Row>
        ))}
      </Section>
      <Section title={t('friends.blocked')}>
        {(blocks.data?.items ?? []).map((r) => (
          <Row key={r.user.id} rel={r}>
            <Button
              label={t('friends.unblock')}
              variant="secondary"
              onPress={() => unblock.mutate(p(r))}
            />
          </Row>
        ))}
      </Section>
    </Screen>
  );
}

function Section({
  title,
  children,
  empty,
}: {
  title: string;
  children: ReactNode[];
  empty?: string;
}) {
  const theme = useTheme();
  if (!children.length && !empty) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text
        accessibilityRole="header"
        style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}
      >
        {title}
      </Text>
      {children.length ? children : <Body muted>{empty}</Body>}
    </View>
  );
}

function Row({ rel, children }: { rel: Relationship; children: ReactNode }) {
  const theme = useTheme();
  const name = rel.user.display_name || rel.user.username;
  return (
    <View
      accessible={false}
      style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: theme.card }}
      testID={`friend-row-${rel.user.username}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar user={rel.user} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontWeight: '600' }}>{name}</Text>
          <Text style={{ color: theme.muted }}>@{rel.user.username}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}
