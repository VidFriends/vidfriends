// Groups of friends (FR-FRND-06, BR-GRP-1..3): create, edit and delete; used on Send.
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@vidfriends/api-client';
import { useApi, useApiQuery } from '@vidfriends/api-client/react';
import {
  createFriendGroup,
  deleteFriendGroup,
  listFriendGroups,
  listFriends,
  MAX_GROUP_MEMBERS,
  updateFriendGroup,
  type FriendGroup,
} from '@vidfriends/contracts';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage, fieldMessage } from '@/lib/errors';

export function GroupsCard() {
  const { t } = useTranslation();
  const groups = useApiQuery(listFriendGroups);
  const [editing, setEditing] = useState<FriendGroup | 'new' | null>(null);
  const items = groups.data?.items ?? [];
  return (
    <Card className="grid gap-3">
      <CardTitle>{t('groups.title')}</CardTitle>
      <CardDescription>{t('groups.help')}</CardDescription>
      {items.length > 0 && (
        <ul className="grid gap-2" aria-label={t('groups.title')}>
          {items.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="grid gap-0.5">
                <span className="font-medium">{g.name}</span>
                <span className="text-muted-foreground">
                  {g.members.length
                    ? g.members.map((m) => m.display_name || m.username).join(', ')
                    : t('groups.noMembers')}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(g)}>
                {t('groups.edit')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <GroupForm
          key={editing === 'new' ? 'new' : editing.id}
          group={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : (
        <div>
          <Button variant="outline" onClick={() => setEditing('new')}>
            {t('groups.new')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function GroupForm({ group, onDone }: { group: FriendGroup | null; onDone: () => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const friends = useApiQuery(listFriends);
  const [name, setName] = useState(group?.name ?? '');
  const [selected, setSelected] = useState<Set<string>>(
    new Set(group?.members.map((m) => m.id) ?? []),
  );
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, done: string) {
    setFields({});
    setError(null);
    setBusy(true);
    try {
      await action();
      toast.success(done);
      await queryClient.invalidateQueries({ queryKey: [listFriendGroups.id] });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'validation_failed') setFields(err.fields);
      else setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    const body = { name: name.trim(), member_ids: [...selected] };
    void run(
      () =>
        group
          ? api.call(updateFriendGroup, { params: { id: group.id }, body })
          : api.call(createFriendGroup, { body }),
      t('groups.saved'),
    );
  };

  return (
    <form className="grid gap-3 rounded-md border p-3" onSubmit={save} noValidate>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Field label={t('groups.name')} error={fieldMessage(t, fields.name)}>
        <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </Field>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">
          {t('groups.members', { max: MAX_GROUP_MEMBERS })}
        </legend>
        {fields.member_ids && (
          <p className="text-sm text-destructive">{fieldMessage(t, fields.member_ids)}</p>
        )}
        {(friends.data?.items ?? []).map((f) => (
          <label key={f.user.id} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={selected.has(f.user.id)}
              disabled={!selected.has(f.user.id) && selected.size >= MAX_GROUP_MEMBERS}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(f.user.id);
                else next.delete(f.user.id);
                setSelected(next);
              }}
            />
            {f.user.display_name || f.user.username}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !name.trim()}>
          {t('groups.save')}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        {group && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(
                () => api.call(deleteFriendGroup, { params: { id: group.id } }),
                t('groups.deleted'),
              )
            }
          >
            {t('groups.delete')}
          </Button>
        )}
      </div>
    </form>
  );
}
