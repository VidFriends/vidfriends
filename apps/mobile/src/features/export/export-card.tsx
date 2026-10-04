// FR-ACCT-05 / WF-ACCT-4: prepare a copy of my data and open the signed download in the browser.
import { useQueryClient } from '@tanstack/react-query';
import { useApiMutation, useApiQuery } from '@vidfriends/api-client/react';
import { createExport, getExportUrl, listExports, type DataExport } from '@vidfriends/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Switch, Text, View } from 'react-native';
import { errorText, relativeTime } from '@/i18n';
import { useSession } from '@/lib/session';
import { Body, Button, Card, ErrorBox } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

const busyStates = new Set<DataExport['state']>(['queued', 'building']);

export function ExportCard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const qc = useQueryClient();
  const session = useSession();
  const [includeMedia, setIncludeMedia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exports = useApiQuery(
    listExports,
    {},
    {
      refetchInterval: (q) =>
        q.state.data?.items.some((e) => busyStates.has(e.state)) ? 3000 : false,
    },
  );
  const request = useApiMutation(createExport, {
    onSuccess: () => void qc.invalidateQueries({ queryKey: [listExports.id] }),
    onError: (err) =>
      setError(
        (err as { code?: string }).code === 'rate_limited'
          ? t('settings.exportRateLimited')
          : errorText(err),
      ),
  });
  const items = (exports.data?.items ?? []) as DataExport[];
  const latest = items[0];
  const busy = items.some((e) => busyStates.has(e.state));

  async function open(id: string) {
    setError(null);
    try {
      const { url } = await session.api.call(getExportUrl, { params: { id } });
      await Linking.openURL(url);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Card>
      <Text
        accessibilityRole="header"
        style={{ color: theme.text, fontSize: 17, fontWeight: '600' }}
      >
        {t('settings.exportTitle')}
      </Text>
      <Body muted>{t('settings.exportHelp')}</Body>
      <ErrorBox message={error} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: theme.text, fontSize: 16, flex: 1 }}>
          {t('settings.exportIncludeMedia')}
        </Text>
        <Switch
          accessibilityLabel={t('settings.exportIncludeMedia')}
          value={includeMedia}
          onValueChange={setIncludeMedia}
        />
      </View>
      {latest ? (
        <Body testID="export-status">
          {t(`settings.exportState.${latest.state}`)}
          {latest.state === 'ready' && latest.expires_at
            ? ` · ${t('settings.exportExpires', { when: relativeTime(latest.expires_at) })}`
            : ''}
        </Body>
      ) : null}
      {latest?.state === 'ready' ? (
        <Button
          label={t('settings.exportDownload')}
          onPress={() => void open(latest.id)}
          testID="export-download"
        />
      ) : null}
      <Button
        label={t('settings.exportSubmit')}
        variant="secondary"
        busy={request.isPending}
        disabled={busy}
        onPress={() => {
          setError(null);
          request.mutate({ body: { include_media: includeMedia } });
        }}
        testID="export-request"
      />
    </Card>
  );
}
