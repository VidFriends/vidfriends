// Send (J-3, FR-SHR-01/02, FR-MOB-02): paste or receive a link (share sheet), or pick a video,
// then choose friends, add a note and send. Delivery waits for processing on the server.
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from '@vidfriends/api-client/react';
import {
  addVideo,
  getSent,
  getVideo,
  listFriendGroups,
  listFriends,
  MAX_GROUP_MEMBERS,
  sendShares,
  type Relationship,
  type Video,
} from '@vidfriends/contracts';
import * as ImagePicker from 'expo-image-picker';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { errorText } from '@/i18n';
import { useSession } from '@/lib/session';
import { uploadVideo } from '@/lib/upload';
import { Avatar } from '@/ui/avatar';
import { Body, Button, Card, ErrorBox, Field, Screen, Title } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

const newKey = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export default function Send() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { api } = useSession();
  const qc = useQueryClient();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [url, setUrl] = useState('');
  const [video, setVideo] = useState<Video | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const idempotency = useRef(newKey());
  const friends = useApiQuery(listFriends);
  const groups = useApiQuery(listFriendGroups);

  // Poll the video while it is fetched or processed (FR-VID-02/04).
  const pending = video && ['queued', 'fetching', 'processing'].includes(video.state);
  const polled = useApiQuery(
    getVideo,
    { params: { id: video?.id ?? '' } },
    { enabled: Boolean(pending), refetchInterval: 2000 },
  );
  useEffect(() => {
    if (polled.data) setVideo(polled.data.video);
  }, [polled.data]);

  async function addLink(link: string) {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await api.call(addVideo, { body: { url: link } });
      setVideo(res.video);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function addFile(file: { uri: string; name: string; mimeType?: string | null }) {
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      setVideo(await uploadVideo(api, file, setProgress));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setProgress(null);
    }
  }

  // FR-MOB-02: content shared from another app.
  useEffect(() => {
    if (!hasShareIntent) return;
    const file = shareIntent.files?.find((f) => f.mimeType?.startsWith('video/'));
    const link = shareIntent.webUrl ?? shareIntent.text?.match(/https?:\/\/\S+/)?.[0] ?? null;
    resetShareIntent();
    if (file) void addFile({ uri: file.path, name: file.fileName, mimeType: file.mimeType });
    else if (link) {
      setUrl(link);
      void addLink(link);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent]);

  async function pickVideo() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    const asset = res.canceled ? null : res.assets[0];
    if (asset) {
      await addFile({
        uri: asset.uri,
        name: asset.fileName ?? 'video.mp4',
        mimeType: asset.mimeType,
      });
    }
  }

  async function send() {
    if (!video || !picked.size) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.call(sendShares, {
        body: {
          video_id: video.id,
          recipient_ids: [...picked],
          note: note.trim() || undefined,
          idempotency_key: idempotency.current,
        },
      });
      const sent = res.results.filter((r) => r.status !== 'not_allowed').length;
      setResult(t('send.sentTo', { count: sent }));
      void qc.invalidateQueries({ queryKey: [getSent.id] });
      setVideo(null);
      setUrl('');
      setNote('');
      setPicked(new Set());
      idempotency.current = newKey();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const friendList = (friends.data?.items ?? []) as Relationship[];
  return (
    <Screen edges={[]}>
      <ErrorBox message={error} />
      {result ? (
        <Card>
          <Body>{result}</Body>
        </Card>
      ) : null}
      {!video ? (
        <>
          <Field
            label={t('send.linkLabel')}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://"
            testID="send-url"
          />
          <Button
            label={t('send.addLink')}
            busy={busy}
            disabled={!url.trim()}
            onPress={() => void addLink(url.trim())}
            testID="send-add"
          />
          <Button
            label={
              progress === null
                ? t('send.pickVideo')
                : t('send.uploading', { percent: Math.round(progress * 100) })
            }
            variant="secondary"
            disabled={progress !== null}
            onPress={() => void pickVideo()}
          />
        </>
      ) : (
        <Card>
          <Title>{video.title || t('feed.untitled')}</Title>
          <Body muted>{t(`send.state.${video.state}`)}</Body>
          <Button label={t('send.change')} variant="secondary" onPress={() => setVideo(null)} />
        </Card>
      )}
      {video ? (
        <>
          <Text
            accessibilityRole="header"
            style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}
          >
            {t('send.pickFriends')}
          </Text>
          {friendList.length === 0 ? <Body muted>{t('send.noFriends')}</Body> : null}
          {/* BR-GRP-3: a group selects its members (managed on the web, Friends page). */}
          {(groups.data?.items ?? [])
            .filter((g) => g.members.length)
            .map((g) => (
              <Button
                key={g.id}
                label={t('groups.add', { name: g.name, count: g.members.length })}
                variant="secondary"
                testID={`send-group-${g.id}`}
                onPress={() => {
                  const next = new Set(picked);
                  for (const m of g.members) if (next.size < MAX_GROUP_MEMBERS) next.add(m.id);
                  setPicked(next);
                }}
              />
            ))}
          {friendList.map(({ user }) => {
            const on = picked.has(user.id);
            const name = user.display_name || user.username;
            return (
              <Pressable
                key={user.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={name}
                testID={`send-friend-${user.username}`}
                onPress={() => {
                  const next = new Set(picked);
                  if (on) next.delete(user.id);
                  else next.add(user.id);
                  setPicked(next);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 48,
                  padding: 8,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: on ? theme.primary : theme.border,
                }}
              >
                <Avatar user={user} />
                <Text style={{ color: theme.text, flex: 1 }}>{name}</Text>
                <Text style={{ color: theme.primary }}>{on ? '✓' : ''}</Text>
              </Pressable>
            );
          })}
          <Field
            label={t('send.note')}
            value={note}
            onChangeText={setNote}
            maxLength={500}
            multiline
            testID="send-note"
          />
          <View>
            <Button
              label={t('send.send', { count: picked.size })}
              disabled={!picked.size || video.state === 'failed'}
              busy={busy}
              onPress={() => void send()}
              testID="send-submit"
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
