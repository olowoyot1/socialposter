import { TwitterApi } from "twitter-api-v2";
import { PlatformAdapter } from "./PlatformAdapter.js";

const CHAR_LIMIT = 280;

export class TwitterAdapter extends PlatformAdapter {
  static platformKey = "TWITTER";

  #client() {
    return new TwitterApi({
      clientId: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET,
    });
  }

  getAuthUrl(state) {
    const client = this.#client();
    const { url, codeVerifier } = client.generateOAuth2AuthLink(
      process.env.TWITTER_CALLBACK_URL,
      { scope: ["tweet.read", "tweet.write", "users.read", "offline.access"], state }
    );
    // Caller (accounts.js) persists codeVerifier in the DB and passes it
    // back into handleOAuthCallback — see PlatformAdapter.js for why.
    return { url, verifier: codeVerifier };
  }

  async handleOAuthCallback({ code }, codeVerifier) {
    if (!codeVerifier) throw new Error("Missing or expired OAuth verifier");

    const client = this.#client();
    const {
      client: loggedClient,
      accessToken,
      refreshToken,
      expiresIn,
    } = await client.loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri: process.env.TWITTER_CALLBACK_URL,
    });

    const me = await loggedClient.v2.me();

    return {
      externalId: me.data.id,
      displayName: `@${me.data.username}`,
      accessToken,
      refreshToken,
      tokenExpires: new Date(Date.now() + expiresIn * 1000),
      metadata: {},
    };
  }

  async validate(post) {
    if (!post.body || post.body.trim().length === 0) {
      if (!post.mediaUrls?.length) {
        throw new Error("Tweet needs text or media");
      }
    }
    if (post.body.length > CHAR_LIMIT) {
      throw new Error(`Tweet exceeds ${CHAR_LIMIT} characters (${post.body.length})`);
    }
    if (post.mediaUrls?.length > 4) {
      throw new Error("X allows a maximum of 4 images per tweet");
    }
    return post;
  }

  async publish(account, post) {
    const client = new TwitterApi(account.accessToken);

    let mediaIds = [];
    if (post.mediaUrls?.length) {
      // twitter-api-v2 needs local buffers/paths; fetch each media URL then upload.
      mediaIds = await Promise.all(
        post.mediaUrls.map(async (url) => {
          const res = await fetch(url);
          const buffer = Buffer.from(await res.arrayBuffer());
          const mimeType = res.headers.get("content-type") || "image/jpeg";
          return client.v1.uploadMedia(buffer, { mimeType });
        })
      );
    }

    const { data } = await client.v2.tweet({
      text: post.body,
      ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}),
    });

    return { externalPostId: data.id, raw: data };
  }

  async refreshToken(account) {
    const client = this.#client();
    const { accessToken, refreshToken, expiresIn } = await client.refreshOAuth2Token(
      account.refreshToken
    );
    return {
      accessToken,
      refreshToken,
      tokenExpires: new Date(Date.now() + expiresIn * 1000),
    };
  }
}
