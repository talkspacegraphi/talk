const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

let sentryInstance: any = null;

async function getSentry() {
  if (sentryInstance) return sentryInstance;
  if (!SENTRY_DSN) return null;
  try {
    const mod = await new Function('return import("@sentry/react")')();
    sentryInstance = mod;
    return sentryInstance;
  } catch {
    return null;
  }
}

export async function captureException(error: Error, extra?: Record<string, unknown>) {
  const Sentry = await getSentry();
  if (!Sentry) return;

  if (!Sentry['__sentryInitialized']) {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: import.meta.env.MODE,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
      ],
      tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });
    Sentry['__sentryInitialized'] = true;
  }
  Sentry.captureException(error, extra);
}
