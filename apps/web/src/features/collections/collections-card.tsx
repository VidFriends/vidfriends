// Collections (FR-FEED-07, BR-COL-1..3): the member's named lists of saved videos, on Saved.
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ApiError } from '@vidfriends/api-client';
import { useApi, useApiQuery } from '@vidfriends/api-client/react';
import { createCollection, listCollections } from '@vidfriends/contracts';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { errorMessage, fieldMessage } from '@/lib/errors';
import { refreshCollections } from './refresh';

export function CollectionsCard() {
  const { t } = useTranslation();
  const collections = useApiQuery(listCollections, { query: {} });
  const items = collections.data?.items ?? [];
  return (
    <Card className="grid gap-3">
      <CardTitle>{t('collections.title')}</CardTitle>
      <CardDescription>{t('collections.help')}</CardDescription>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('collections.title')}>
          {items.map((c) => (
            <li key={c.id}>
              <Link
                to="/collections/$id"
                params={{ id: c.id }}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground">
                  {t('collections.count', { count: c.item_count })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <NewCollectionForm />
    </Card>
  );
}

/** Creates a collection, optionally holding `shareId` from the start. */
export function NewCollectionForm({
  shareId,
  onCreated,
}: {
  shareId?: string;
  onCreated?: () => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const inputId = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.call(createCollection, {
        body: { name: name.trim(), ...(shareId ? { share_id: shareId } : {}) },
      });
      setName('');
      await refreshCollections(queryClient);
      onCreated?.();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'validation_failed'
          ? (fieldMessage(t, err.fields.name) ?? errorMessage(t, err))
          : errorMessage(t, err),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="grid gap-2" onSubmit={(e) => void submit(e)} noValidate>
      {error && <Alert variant="destructive">{error}</Alert>}
      <label htmlFor={inputId} className="text-sm font-medium">
        {t('collections.newName')}
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('collections.namePlaceholder')}
        />
        <Button type="submit" disabled={busy || !name.trim()}>
          {t('collections.create')}
        </Button>
      </div>
    </form>
  );
}
