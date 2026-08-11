import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.doUnmock("posthog-js");
});

describe("analytics", () => {
  it("does not load PostHog when public configuration is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    const loadPostHog = vi.fn(() => ({ default: {} }));
    vi.doMock("posthog-js", loadPostHog);

    const { capture, initializeAnalytics } = await import("./analytics");

    capture("test_event");
    expect(await initializeAnalytics()).toBeNull();
    expect(loadPostHog).not.toHaveBeenCalled();
  });

  it("initializes once and delivers events queued during loading", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://example.test");

    const posthog = {
      __loaded: false,
      init: vi.fn(() => {
        posthog.__loaded = true;
      }),
      capture: vi.fn(),
      captureException: vi.fn(),
    };
    const loadPostHog = vi.fn(() => ({ default: posthog }));
    vi.doMock("posthog-js", loadPostHog);

    const { capture, captureException, initializeAnalytics } = await import("./analytics");
    const error = new Error("test");

    capture("test_event", { source: "unit" });
    captureException(error);
    await initializeAnalytics();

    await vi.waitFor(() => {
      expect(posthog.capture).toHaveBeenCalledWith("test_event", { source: "unit" });
      expect(posthog.captureException).toHaveBeenCalledWith(error, undefined);
    });
    expect(loadPostHog).toHaveBeenCalledTimes(1);
    expect(posthog.init).toHaveBeenCalledWith("phc_test", {
      api_host: "https://example.test",
      defaults: "2026-01-30",
      capture_exceptions: true,
      debug: false,
    });
  });
});
