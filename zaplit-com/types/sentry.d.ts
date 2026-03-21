// Type declarations for Sentry when loaded via CDN or npm

declare global {
  interface Window {
    Sentry?: {
      captureException: (error: Error, context?: {
        extra?: Record<string, unknown>;
        tags?: Record<string, string>;
      }) => void;
      captureMessage: (message: string, level?: string) => void;
    };
  }
}

export {};
