// "Add to collection" on a received share (FR-FEED-07, BR-COL-2): tick collections, or make one.
import { useQueryClient } from '@tanstack/react-query';
import { useApi, useApiQuery } from '@vidfriends/api-client/react';
import { addToCollection, listCollections, removeFromCollection } from '@vidfriends/contracts';
import { FolderPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { errorMessage } from '@/lib/errors';
import { NewCollectionForm } from './collections-card';
import { refreshCollections } from './refresh';

export function AddToCollection({ shareId }: { shareId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FolderPlus aria-hidden />
          {t('collections.add')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{t('collections.addTitle')}</DialogTitle>
        <DialogDescription>{t('collections.addHelp')}</DialogDescription>
        {open && <Picker shareId={shareId} />}
      </DialogContent>
    </Dialog>
  );
}

function Picker({ shareId }: { shareId: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const collections = useApiQuery(listCollections, { query: { share_id: shareId } });
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (id: string, add: boolean) => {
    setBusy(id);
    try {
      await api.call(add ? addToCollection : removeFromCollection, {
        params: { id, share_id: shareId },
      });
      await refreshCollections(queryClient);
    } catch (err) {
      toast.error(errorMessage(t, err));
    } finally {
      setBusy(null);
    }
  };
  const items = collections.data?.items ?? [];
  return (
    <div className="grid gap-4">
      {items.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="sr-only">{t('collections.title')}</legend>
          {items.map((c) => (
            <label key={c.id} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={Boolean(c.contains)}
                disabled={busy === c.id}
                onChange={(e) => void toggle(c.id, e.target.checked)}
              />
              {c.name}
            </label>
          ))}
        </fieldset>
      )}
      <NewCollectionForm shareId={shareId} />
    </div>
  );
}
