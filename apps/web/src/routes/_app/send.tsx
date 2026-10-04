// Send, step 1 (M3-T8, PRD J-3): add a video by link or upload. Choosing friends is step 2 (M4).
import { createFileRoute } from '@tanstack/react-router';
import { useApi, useApiMutation } from '@vidfriends/api-client/react';
import { addVideo, type Video } from '@vidfriends/contracts';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useVideoProgress, VideoStatus } from '@/features/send/video-status';
import { errorMessage, fieldMessage } from '@/lib/errors';
import { uploadContentType, uploadVideo } from '@/lib/upload';

const search = z.object({
  url: z.string().optional().catch(undefined),
  text: z.string().optional().catch(undefined),
});

/** Many apps share the URL inside `text`; take the first URL from either field (TDD §4). */
export function firstUrl(...values: (string | undefined)[]): string {
  for (const v of values) {
    const m = v?.match(/https?:\/\/[^\s<>"']+/);
    if (m) return m[0];
  }
  return '';
}

export const Route = createFileRoute('/_app/send')({
  validateSearch: search,
  component: SendPage,
});

function SendPage() {
  const { t } = useTranslation();
  const [video, setVideo] = useState<Video | null>(null);
  return (
    <div className="grid max-w-2xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t('send.title')}</h1>
        <p className="text-muted-foreground">{t('send.intro')}</p>
      </div>
      {video ? (
        <AddedVideo video={video} onReset={() => setVideo(null)} />
      ) : (
        <AddVideo onAdded={setVideo} />
      )}
    </div>
  );
}

function AddedVideo({ video, onReset }: { video: Video; onReset: () => void }) {
  const { t } = useTranslation();
  const current = useVideoProgress(video);
  return (
    <Card className="grid gap-4">
      <VideoStatus video={current} />
      <div>
        <Button variant="outline" onClick={onReset}>
          {t('send.another')}
        </Button>
      </div>
    </Card>
  );
}

function AddVideo({ onAdded }: { onAdded: (v: Video) => void }) {
  const { t } = useTranslation();
  const params = Route.useSearch();
  const [tab, setTab] = useState<'link' | 'upload'>('link');
  const tabsId = useId();
  return (
    <Card className="grid gap-4">
      <div role="tablist" aria-label={t('send.title')} className="flex gap-2">
        {(['link', 'upload'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            id={`${tabsId}-${k}`}
            aria-selected={tab === k}
            aria-controls={`${tabsId}-${k}-panel`}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab === k ? 'bg-muted' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {t(k === 'link' ? 'send.linkTab' : 'send.uploadTab')}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${tabsId}-${tab}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
        {tab === 'link' ? (
          <LinkForm initial={firstUrl(params.url, params.text)} onAdded={onAdded} />
        ) : (
          <UploadForm onAdded={onAdded} />
        )}
      </div>
    </Card>
  );
}

function LinkForm({ initial, onAdded }: { initial: string; onAdded: (v: Video) => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(initial);
  const mutation = useApiMutation(addVideo, { onSuccess: (res) => onAdded(res.video) });
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim()) mutation.mutate({ body: { url: url.trim() } });
      }}
    >
      {mutation.isError && <Alert variant="destructive">{errorMessage(t, mutation.error)}</Alert>}
      <Field label={t('send.linkLabel')}>
        <Input
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder={t('send.linkPlaceholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </Field>
      <div>
        <Button type="submit" disabled={mutation.isPending || !url.trim()}>
          {t('send.linkSubmit')}
        </Button>
      </div>
    </form>
  );
}

function UploadForm({ onAdded }: { onAdded: (v: Video) => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        const type = uploadContentType(file);
        if (!type) return setError(t('send.notAVideo'));
        setError(null);
        setProgress(0);
        try {
          onAdded(await uploadVideo(api, file, type, setProgress));
        } catch (err) {
          const fields = (err as { fields?: Record<string, string> }).fields;
          setError(
            fields?.upload_id ? (fieldMessage(t, fields.upload_id) ?? null) : errorMessage(t, err),
          );
        } finally {
          setProgress(null);
        }
      }}
    >
      {error && <Alert variant="destructive">{error}</Alert>}
      <Field label={t('send.fileLabel')}>
        <Input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </Field>
      {progress !== null && (
        <div className="grid gap-1">
          <progress
            value={progress}
            max={1}
            className="w-full"
            aria-label={t('send.uploading', { percent: Math.round(progress * 100) })}
          />
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {t('send.uploading', { percent: Math.round(progress * 100) })}
          </span>
        </div>
      )}
      <div>
        <Button type="submit" disabled={!file || progress !== null}>
          {t('send.uploadSubmit')}
        </Button>
      </div>
    </form>
  );
}
