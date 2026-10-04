// QR scanning for pairing (TDD §4: expo-camera barcode scanning). The QR encodes the join URL.
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Body, Button, Loading, Screen } from '@/ui/kit';

export default function Scan() {
  const { t } = useTranslation();
  const [permission, request] = useCameraPermissions();
  const done = useRef(false);
  if (!permission) return <Loading />;
  if (!permission.granted) {
    return (
      <Screen>
        <Body>{t('pair.cameraNeeded')}</Body>
        <Button label={t('pair.allowCamera')} onPress={() => void request()} />
      </Screen>
    );
  }
  return (
    <View style={styles.fill}>
      <CameraView
        style={styles.fill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        accessibilityLabel={t('pair.scanTitle')}
        onBarcodeScanned={({ data }) => {
          if (done.current) return;
          done.current = true;
          router.replace({ pathname: '/pair', params: { link: data } });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
