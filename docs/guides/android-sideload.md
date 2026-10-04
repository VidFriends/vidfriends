# Installing the Android app without a store

Until VidFriends is in Google Play and the App Store (roadmap M6-T7, which waits for the
project's developer accounts), each [release](https://github.com/VidFriends/vidfriends/releases)
carries an Android app file (`vidfriends-vX.Y.Z.apk`) that people can install directly
("sideloading", roadmap M6-T8). There is no iPhone app yet; iPhone users use the web app, which
can be added to the home screen.

## For members

1. On the Android phone, open the project's releases page and download the newest
   `vidfriends-….apk`. Your server's operator may also send you the link.
2. Optional but recommended: compare the file's SHA-256 checksum with the `.apk.sha256` file next
   to it (for example with a file manager that shows checksums).
3. Open the downloaded file. Android asks you to allow installing apps from your browser or file
   manager ("Install unknown apps"); allow it for this install, then turn it off again in
   Settings → Apps → Special app access.
4. Open VidFriends and scan your server's QR code or paste your join link.

**Updates:** install the newer APK the same way; Android keeps your data because every release is
signed with the same key. The app does not update itself.

## For maintainers: the signing key

Android installs an update only if it is signed with the same key as the installed app, so the
release workflow signs every APK with one long-lived upload key kept in repository secrets. It is
never committed. Create it once, on a trusted machine:

```sh
keytool -genkeypair -keystore vidfriends-upload.jks -storetype PKCS12 -alias upload \
  -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=VidFriends"
base64 -w0 vidfriends-upload.jks > vidfriends-upload.jks.b64
```

Then, in the repository's **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contents of `vidfriends-upload.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the key password (omit if it is the same as the keystore password) |

Keep an offline backup of the keystore and its password: losing it means members must uninstall
the app (losing its sign-in) before installing a release signed with a new key. When the app moves
to Google Play, this key becomes the Play upload key.

Without these secrets the workflow still builds and checks the APK but does not attach it, and the
run shows a warning. The `versionCode` is `1000 + the workflow run number`, so every release can be
installed over the previous one.
