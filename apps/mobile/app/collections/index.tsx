// My collections (FR-FEED-07, BR-COL-1): list with counts, and a new one.
import { useQueryClient } from '@tanstack/react-query';
import { useApiMutation, useApiQuery } from '@vidfriends/api-client/react';
import { createCollection, listCollections } from '@vidfriends/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { refreshCollections } from '@/features/collections';
import { errorText } from '@/i18n';
import { Body, Button, ErrorBox, Field, Loading, Screen } from '@/ui/kit';

export default function Collections() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useApiQuery(listCollections, { query: {} });
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useApiMutation(createCollection, {
    onSuccess: () => {
      setName('');
      void refreshCollections(qc);
    },
    onError: (err) => setError(errorText(err)),
  });
  if (list.isPending) return <Loading />;
  const items = list.data?.items ?? [];
  return (
    <Screen edges={['bottom']}>
      <Body muted>{t('collections.help')}</Body>
      <ErrorBox message={error ?? (list.isError ? errorText(list.error) : null)} />
      {items.map((c) => (
        <Button
          key={c.id}
          label={`${c.name} · ${t('collections.count', { count: c.item_count })}`}
          variant="secondary"
          testID={`collection-${c.name}`}
          onPress={() => router.push({ pathname: '/collections/[id]', params: { id: c.id } })}
        />
      ))}
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
        onPress={() => {
          setError(null);
          create.mutate({ body: { name: name.trim() } });
        }}
      />
    </Screen>
  );
}
