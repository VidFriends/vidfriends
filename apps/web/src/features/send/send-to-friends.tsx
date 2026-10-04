// Send, step 2 (WF-SHR-1): choose friends, optional note, per-recipient results.
import { useApiMutation, useApiQuery } from '@vidfriends/api-client/react';
import { listFriends, sendShares, type Video } from '@vidfriends/contracts';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/avatar';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { errorMessage } from '@/lib/errors';

export function SendToFriends({ video }: { video: Video }) {
  const { t } = useTranslation();
  const friends = useApiQuery(listFriends);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  // One key per composed send: retries of the same send are idempotent (WF-SHR-1).
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const send = useApiMutation(sendShares);
  const names = new Map(
    (friends.data?.items ?? []).map((f) => [f.user.id, f.user.display_name || f.user.username]),
  );
  const pending =
    video.state === 'queued' || video.state === 'fetching' || video.state === 'processing';

  if (send.data) {
    return (
      <div className="grid gap-2" role="status">
        <ul className="grid gap-1" aria-label={t('sendStep2.title')}>
          {send.data.results.map((r) => (
            <li
              key={r.recipient_id}
              className="text-sm"
              data-testid="send-result"
              data-status={r.status}
            >
              {t(
                r.status === 'sent'
                  ? 'sendStep2.resultSent'
                  : r.status === 'already_sent'
                    ? 'sendStep2.resultAlready'
                    : 'sendStep2.resultNotAllowed',
                {
                  name: names.get(r.recipient_id) ?? '?',
                },
              )}
            </li>
          ))}
        </ul>
        {pending && <p className="text-sm text-muted-foreground">{t('sendStep2.pendingNote')}</p>}
      </div>
    );
  }
  if (video.state === 'failed') return null;
  const items = friends.data?.items ?? [];
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!selected.size) return;
        send.mutate({
          body: {
            video_id: video.id,
            recipient_ids: [...selected],
            note: note.trim() || undefined,
            idempotency_key: idempotencyKey,
          },
        });
      }}
    >
      <h2 className="text-lg font-semibold">{t('sendStep2.title')}</h2>
      {send.isError && <Alert variant="destructive">{errorMessage(t, send.error)}</Alert>}
      {friends.isSuccess && !items.length ? (
        <p className="text-sm text-muted-foreground">
          {t('sendStep2.noFriends')}{' '}
          <Link to="/friends" className="underline">
            {t('nav.friends')}
          </Link>
        </p>
      ) : (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t('sendStep2.chooseFriends')}</legend>
          {items.map((f) => (
            <label key={f.user.id} className="flex items-center gap-3 rounded-md border p-2">
              <input
                type="checkbox"
                className="size-4"
                checked={selected.has(f.user.id)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(f.user.id);
                  else next.delete(f.user.id);
                  setSelected(next);
                }}
              />
              <Avatar user={f.user} size={28} />
              <span>{f.user.display_name || f.user.username}</span>
            </label>
          ))}
        </fieldset>
      )}
      <Field label={t('sendStep2.note')} help={t('sendStep2.noteHelp')}>
        <textarea
          value={note}
          maxLength={500}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>
      <div>
        <Button type="submit" disabled={!selected.size || send.isPending}>
          {send.isPending ? t('sendStep2.sending') : t('sendStep2.send')}
        </Button>
      </div>
    </form>
  );
}
