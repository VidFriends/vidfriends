// One collection (FR-FEED-07, BR-COL-1..3): its videos, newest added first; rename, delete, remove.
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ApiError } from '@vidfriends/api-client';
import { useApi, useApiQuery } from '@vidfriends/api-client/react';
import {
  deleteCollection,
  getCollection,
  removeFromCollection,
  updateCollection,
} from '@vidfriends/contracts';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { refreshCollections } from '@/features/collections/refresh';
import { ReceivedList } from '@/features/shares/received-list';
import { errorMessage, fieldMessage } from '@/lib/errors';

export const Route = createFileRoute('/_app/collections/$id')({ component: CollectionPage });

function CollectionPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // The first page carries the collection itself (name and count).
  const head = useApiQuery(getCollection, { params: { id }, query: { limit: 1 } });
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (head.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (head.isError) return <Alert variant="destructive">{errorMessage(t, head.error)}</Alert>;
  const collection = head.data.collection;

  const remove = async (shareId: string) => {
    try {
      await api.call(removeFromCollection, { params: { id, share_id: shareId } });
      await refreshCollections(queryClient);
      toast.success(t('collections.removed'));
    } catch (err) {
      toast.error(errorMessage(t, err));
    }
  };

  return (
    <div className="grid max-w-3xl gap-4">
      <Link to="/saved" className="text-sm text-muted-foreground hover:underline">
        {t('collections.back')}
      </Link>
      {renaming ? (
        <RenameForm id={id} name={collection.name} onDone={() => setRenaming(false)} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">{collection.name}</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setRenaming(true)}>
              {t('collections.rename')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirm(true)}>
              {t('collections.delete')}
            </Button>
          </div>
        </div>
      )}
      <ReceivedList
        route={getCollection}
        params={{ id }}
        label={collection.name}
        empty={t('collections.empty')}
        actions={(share) => (
          <Button
            variant="outline"
            size="sm"
            aria-label={t('collections.removeOne', { title: share.video.title })}
            onClick={() => void remove(share.id)}
          >
            {t('collections.remove')}
          </Button>
        )}
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('collections.deleteTitle', { name: collection.name })}
        description={t('collections.deleteHelp')}
        confirmLabel={t('collections.delete')}
        onConfirm={() =>
          void (async () => {
            try {
              await api.call(deleteCollection, { params: { id } });
              await refreshCollections(queryClient);
              toast.success(t('collections.deleted'));
              await navigate({ to: '/saved' });
            } catch (err) {
              toast.error(errorMessage(t, err));
            }
          })()
        }
      />
    </div>
  );
}

function RenameForm({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const inputId = useId();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.call(updateCollection, { params: { id }, body: { name: value.trim() } });
      await refreshCollections(queryClient);
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'validation_failed'
          ? (fieldMessage(t, err.fields.name) ?? errorMessage(t, err))
          : errorMessage(t, err),
      );
    }
  };
  return (
    <form className="grid gap-2" onSubmit={(e) => void submit(e)} noValidate>
      {error && <Alert variant="destructive">{error}</Alert>}
      <label htmlFor={inputId} className="text-sm font-medium">
        {t('collections.name')}
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={value}
          maxLength={60}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" disabled={!value.trim()}>
          {t('collections.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
