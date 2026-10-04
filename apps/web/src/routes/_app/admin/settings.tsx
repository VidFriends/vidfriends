import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useApiMutation, useApiQuery } from '@vidfriends/api-client/react';
import {
  adminGetSettings,
  adminUpdateSettings,
  getInstance,
  InstanceSettingsPatch,
  type InstanceSettings,
} from '@vidfriends/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/errors';

// WF-ADM-3: every setting is validated by the contract schema here and on the server, and audited.
export const Route = createFileRoute('/_app/admin/settings')({
  component: AdminSettings,
});

const MB = 1024 * 1024;

/** The form keeps text values; sizes are edited in MB and nullable limits are empty for "none". */
type Draft = {
  instance_name: string;
  signup_mode: InstanceSettings['signup_mode'];
  members_can_invite: boolean;
  link_download_enabled: boolean;
  platform_allowlist: string;
  max_media_bytes: string;
  max_duration_seconds: string;
  per_user_quota_bytes: string;
  instance_storage_cap_bytes: string;
  retention_days: string;
  session_idle_days: string;
  session_absolute_days: string;
};

const toMb = (b: number | null) => (b === null ? '' : String(Math.round(b / MB)));

function toDraft(s: InstanceSettings): Draft {
  return {
    instance_name: s.instance_name,
    signup_mode: s.signup_mode,
    members_can_invite: s.members_can_invite,
    link_download_enabled: s.link_download_enabled,
    platform_allowlist: s.platform_allowlist.join('\n'),
    max_media_bytes: toMb(s.max_media_bytes),
    max_duration_seconds: String(s.max_duration_seconds),
    per_user_quota_bytes: toMb(s.per_user_quota_bytes),
    instance_storage_cap_bytes: toMb(s.instance_storage_cap_bytes),
    retention_days: String(s.retention_days),
    session_idle_days: String(s.session_idle_days),
    session_absolute_days: String(s.session_absolute_days),
  };
}

const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));
const mbOrNull = (v: string) => (v.trim() === '' ? null : Math.round(num(v) * MB));

function fromDraft(d: Draft) {
  return {
    instance_name: d.instance_name,
    signup_mode: d.signup_mode,
    members_can_invite: d.members_can_invite,
    link_download_enabled: d.link_download_enabled,
    platform_allowlist: d.platform_allowlist
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean),
    max_media_bytes: Math.round(num(d.max_media_bytes) * MB),
    max_duration_seconds: num(d.max_duration_seconds),
    per_user_quota_bytes: mbOrNull(d.per_user_quota_bytes),
    instance_storage_cap_bytes: mbOrNull(d.instance_storage_cap_bytes),
    retention_days: num(d.retention_days),
    session_idle_days: num(d.session_idle_days),
    session_absolute_days: num(d.session_absolute_days),
  };
}

function AdminSettings() {
  const { t } = useTranslation();
  const query = useApiQuery(adminGetSettings);
  if (query.isPending) return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (query.isError) return <Alert variant="destructive">{errorMessage(t, query.error)}</Alert>;
  return <SettingsForm settings={query.data} />;
}

function SettingsForm({ settings }: { settings: InstanceSettings }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  useEffect(() => setDraft(toDraft(settings)), [settings]);
  const mutation = useApiMutation(adminUpdateSettings, {
    onSuccess: async (res) => {
      queryClient.setQueryData([adminGetSettings.id, null, null], res);
      await queryClient.invalidateQueries({ queryKey: [getInstance.id] });
      toast.success(t('admin.settingsSaved'));
    },
  });
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const text = (
    key: Exclude<keyof Draft, 'signup_mode' | `${string}_enabled` | 'members_can_invite'>,
    type = 'number',
  ) => (
    <Field label={t(`admin.fields.${key}`)} error={errors[key]}>
      <Input
        type={type}
        inputMode={type === 'number' ? 'numeric' : undefined}
        value={draft[key]}
        onChange={(e) => set(key, e.target.value)}
      />
    </Field>
  );
  const toggle = (key: 'members_can_invite' | 'link_download_enabled') => (
    <div className="flex items-center gap-3">
      <Switch id={key} checked={draft[key]} onCheckedChange={(v) => set(key, v)} />
      <Label htmlFor={key}>{t(`admin.fields.${key}`)}</Label>
    </div>
  );
  return (
    <Card>
      <form
        className="grid gap-4 sm:grid-cols-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = InstanceSettingsPatch.safeParse(fromDraft(draft));
          if (!parsed.success) {
            const next: Partial<Record<keyof Draft, string>> = {};
            for (const issue of parsed.error.issues)
              next[issue.path[0] as keyof Draft] ??= t('errors.validation_failed');
            setErrors(next);
            return;
          }
          setErrors({});
          mutation.mutate({ body: parsed.data });
        }}
      >
        {mutation.isError && (
          <Alert variant="destructive" className="sm:col-span-2">
            {errorMessage(t, mutation.error)}
          </Alert>
        )}
        {text('instance_name', 'text')}
        <Field label={t('admin.fields.signup_mode')}>
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={draft.signup_mode}
            onChange={(e) => set('signup_mode', e.target.value as Draft['signup_mode'])}
          >
            <option value="invite_only">{t('admin.fields.signup_invite_only')}</option>
            <option value="open">{t('admin.fields.signup_open')}</option>
          </select>
        </Field>
        {toggle('members_can_invite')}
        {toggle('link_download_enabled')}
        <div className="sm:col-span-2">
          <Field label={t('admin.fields.platform_allowlist')} error={errors.platform_allowlist}>
            <textarea
              rows={6}
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
              value={draft.platform_allowlist}
              onChange={(e) => set('platform_allowlist', e.target.value)}
            />
          </Field>
        </div>
        {text('max_media_bytes')}
        {text('max_duration_seconds')}
        {text('per_user_quota_bytes')}
        {text('instance_storage_cap_bytes')}
        {text('retention_days')}
        {text('session_idle_days')}
        {text('session_absolute_days')}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={mutation.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
