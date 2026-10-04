// One collection (FR-FEED-07, BR-COL-3): its videos, newest added first; rename or delete it.
import { useQueryClient } from '@tanstack/react-query';
import { useApiInfiniteQuery, useApiMutation } from '@vidfriends/api-client/react';
import {
  deleteCollection,
  getCollection,
  updateCollection,
  type ReceivedShare,
} from '@vidfriends/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, View } from 'react-native';
import { refreshCollections } from '@/features/collections';
import { ShareRow } from '@/features/shares/list';
import { errorText } from '@/i18n';
import { Body, Button, ErrorBox, Field, Loading, Screen } from '@/ui/kit';

export default function CollectionScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const query = useApiInfiniteQuery(getCollection, { params: { id }, query: { limit: 30 } });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onError = (err: unknown) => setError(errorText(err));
  const rename = useApiMutation(updateCollection, {
    onSuccess: () => {
      setRenaming(null);
      void refreshCollections(qc);
    },
    onError,
  });
  const remove = useApiMutation(deleteCollection, {
    onSuccess: () => {
      void refreshCollections(qc);
      router.back();
    },
    onError,
  });
  if (query.isPending) return <Loading />;
  if (query.isError)
    return (
      <Screen>
        <ErrorBox message={errorText(query.error)} />
      </Screen>
    );
  const collection = query.data.pages[0]!.collection;
  const items = query.data.pages.flatMap((p) => p.items as ReceivedShare[]);
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: collection.name }} />
      <ErrorBox message={error} />
      {items.length === 0 ? <Body muted>{t('collections.empty')}</Body> : null}
      <View>
        {items.map((s) => (
          <ShareRow key={s.id} share={s} />
        ))}
      </View>
      {query.hasNextPage ? (
        <Button
          label={t('common.loadMore')}
          variant="secondary"
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
      {renaming !== null ? (
        <>
          <Field
            label={t('collections.name')}
            value={renaming}
            onChangeText={setRenaming}
            maxLength={60}
          />
          <Button
            label={t('collections.save')}
            disabled={!renaming.trim()}
            onPress={() => rename.mutate({ params: { id }, body: { name: renaming.trim() } })}
          />
        </>
      ) : (
        <Button
          label={t('collections.rename')}
          variant="secondary"
          onPress={() => setRenaming(collection.name)}
        />
      )}
      <Button
        label={t('collections.delete')}
        variant="danger"
        onPress={() =>
          Alert.alert(
            t('collections.deleteTitle', { name: collection.name }),
            t('collections.deleteHelp'),
            [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('collections.delete'),
                style: 'destructive',
                onPress: () => remove.mutate({ params: { id } }),
              },
            ],
          )
        }
      />
    </Screen>
  );
}
