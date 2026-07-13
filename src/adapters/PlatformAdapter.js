/**
 * Every platform adapter implements this shape. Core code (routes, queue,
 * worker) only ever talks to adapters through these methods — it never
 * knows about Twitter-specific or Meta-specific details. That's what makes
 * "add a new platform" a one-file change instead of a core rewrite.
 */
export class PlatformAdapter {
  /** Machine name matching the Prisma `Platform` enum, e.g. "TWITTER". */
  static platformKey = null;

  /**
   * Build the URL the user is redirected to in order to grant access.
   * @param {string} state - CSRF/state token to round-trip through OAuth.
   * @returns {{url: string, verifier?: string}} authorization URL, plus a
   *   PKCE verifier (or any other per-attempt secret) if the platform needs
   *   one. The caller persists `verifier` in the DB (not memory — this must
   *   survive across separate serverless invocations) and hands it back to
   *   handleOAuthCallback.
   */
  getAuthUrl(state) {
    throw new Error("getAuthUrl not implemented");
  }

  /**
   * Exchange the OAuth callback params for tokens, and return the fields
   * needed to create an Account row.
   * @param {object} params - query params from the OAuth redirect
   * @param {string|null} verifier - the value returned from getAuthUrl, if any
   * @returns {Promise<{externalId: string, displayName: string, accessToken: string, refreshToken?: string, tokenExpires?: Date, metadata?: object}>}
   */
  async handleOAuthCallback(params, verifier) {
    throw new Error("handleOAuthCallback not implemented");
  }

  /**
   * Check a post against this platform's constraints (length, media
   * requirements, aspect ratio, etc.) BEFORE it's queued. Throw a
   * descriptive error if invalid, or return normalized post data.
   * @param {{body: string, mediaUrls: string[]}} post
   * @returns {Promise<{body: string, mediaUrls: string[]}>}
   */
  async validate(post) {
    throw new Error("validate not implemented");
  }

  /**
   * Actually publish. Must be safe to retry (the worker may call this
   * again after a transient failure) — check `externalPostId` isn't
   * already set upstream before calling this a second time.
   * @param {object} account - decrypted Account row (accessToken usable as-is)
   * @param {{body: string, mediaUrls: string[]}} post
   * @returns {Promise<{externalPostId: string, raw: object}>}
   */
  async publish(account, post) {
    throw new Error("publish not implemented");
  }

  /**
   * Refresh an expiring access token. Return null if the platform doesn't
   * support refresh (user must reconnect instead).
   * @param {object} account
   * @returns {Promise<{accessToken: string, refreshToken?: string, tokenExpires?: Date} | null>}
   */
  async refreshToken(account) {
    return null;
  }
}
