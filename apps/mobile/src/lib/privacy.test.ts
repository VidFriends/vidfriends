// NFR-PRIV-01: the app embeds no analytics, crash-reporting, attribution or ad SDKs. It talks only
// to the paired server (and, for push tokens, the platform push service via Expo).
import pkg from '../../package.json';

const TRACKERS =
  /analytics|amplitude|mixpanel|segment|posthog|sentry|bugsnag|datadog|crashlytics|firebase|appsflyer|adjust|branch|admob|ads|facebook|onesignal|newrelic|instabug|clarity/i;

describe('NFR-PRIV-01', () => {
  it('has no tracking or advertising dependencies', () => {
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((d) => TRACKERS.test(d))).toEqual([]);
  });
});
