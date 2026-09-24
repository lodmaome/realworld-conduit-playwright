// The frontend deliberately exposes this hook "for testing" (see setupDebugInterface in
// its app.config.ts) so tests can read app state without poking at internals.
export {};

declare global {
  interface Window {
    __conduit_debug__?: {
      getToken(): string | null;
      getAuthState(): 'authenticated' | 'unauthenticated' | 'unavailable' | 'loading';
      getCurrentUser(): { username: string } | null;
    };
  }
}
