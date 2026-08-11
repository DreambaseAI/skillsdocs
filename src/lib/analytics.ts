import type { Properties } from "posthog-js";

type PostHogClient = (typeof import("posthog-js"))["default"];

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

let clientPromise: Promise<PostHogClient | null> | undefined;

async function loadAnalytics(): Promise<PostHogClient | null> {
  if (!projectToken || !apiHost) return null;

  try {
    const { default: posthog } = await import("posthog-js");

    if (!posthog.__loaded) {
      posthog.init(projectToken, {
        api_host: apiHost,
        defaults: "2026-01-30",
        capture_exceptions: true,
        debug: process.env.NODE_ENV === "development",
      });
    }

    return posthog;
  } catch (error) {
    console.error("[skillsdocs] Analytics failed to initialize", error);
    return null;
  }
}

/**
 * Load analytics once, and only in deployments that provide PostHog config.
 * Calls made while the SDK is loading share this promise, which preserves
 * early interactions without putting the SDK in the initial page payload.
 */
export function initializeAnalytics(): Promise<PostHogClient | null> {
  clientPromise ??= loadAnalytics();
  return clientPromise;
}

export function capture(event: string, properties?: Properties): void {
  void initializeAnalytics().then((posthog) => posthog?.capture(event, properties));
}

export function captureException(error: unknown, properties?: Properties): void {
  void initializeAnalytics().then((posthog) => posthog?.captureException(error, properties));
}
