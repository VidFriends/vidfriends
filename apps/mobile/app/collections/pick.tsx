// "Add to collection" for a received share (FR-FEED-07, BR-COL-2): tick collections or make one.
import { useQueryClient } from '@tanstack/react-query';
import { useApi, useApiMutation, useApiQuery } from '@vidfriends/api-client/react';
import {
  addToCollection,
  createCollection,
  listCollections,
  removeFromCollection,
} from '@vidfriends/contracts';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';
import { refreshCollections } from '@/features/collections';
import { errorText } from '@/i18n';
import { Body, Button, ErrorBox, Field, Loading, Screen } from '@/ui/kit';
import { space, useTheme } from '@/ui/theme';

export default function PickCollection() {
  const { t } = useTranslation();
  const theme = useTheme();
  const api = useApi();
  const { share } = useLocalSearchParams<{ share: string }>();
  const qc = useQueryClient();
  const list = useApiQuery(listCollections, { query: { share_id: share } });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = useApiMutation(createCollection, {
    onSuccess: () => {
      setName('');
      void refreshCollections(qc);
    },
    onError: (err) => setError(errorText(err)),
  });
  const toggle = async (id: string, add: boolean) => {
    setBusy(id);
    setError(null);
    try {
      await api.call(add ? addToCollection : removeFromCollection, {
        params: { id, share_id: share },
      });
      await refreshCollections(qc);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  };
  if (list.isPending) return <Loading />;
  return (
    <Screen edges={['bottom']}>
      <Body muted>{t('collections.addHelp')}</Body>
      <ErrorBox message={error ?? (list.isError ? errorText(list.error) : null)} />
      {(list.data?.items ?? []).map((c) => {
        const checked = Boolean(c.contains);
        return (
          <Pressable
            key={c.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked, disabled: busy === c.id }}
            accessibilityLabel={c.name}
            disabled={busy === c.id}
            testID={`pick-${c.name}`}
            onPress={() => void toggle(c.id, !checked)}
            style={[styles.row, { borderColor: checked ? theme.primary : theme.border }]}
          >
            <Text style={{ color: theme.text, fontSize: 18 }}>{checked ? '☑' : '☐'}</Text>
            <Text style={{ color: theme.text, flex: 1 }}>{c.name}</Text>
          </Pressable>
        );
      })}
      <Field
        label={t('collections.newName')}
        value={name}
        onChangeText={setName}
        maxLength={60}
        testID="collection-name"
      />
      <Button
        label={t('collections.create')}
        disabled={!name.trim()}
        busy={create.isPending}
        testID="collection-create"
        onPress={() => create.mutate({ body: { name: name.trim(), share_id: share } })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: 8,
  },
});
