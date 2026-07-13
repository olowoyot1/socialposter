import { PlatformAdapter } from "./PlatformAdapter.js";

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

/**
 * STUB — posts to a Facebook Page (not a personal profile; the Graph API
 * doesn't support posting to personal timelines for apps in recent
 * versions). Shares the Meta App / OAuth flow with InstagramAdapter.
 */
export class FacebookAdapter extends PlatformAdapter {
  static platformKey = "FACEBOOK";

  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID,
      redirect_uri: process.env.META_CALLBACK_URL,
      state,
      scope: "pages_manage_posts,pages_read_engagement,pages_show_list",
      response_type: "code",
    });
    return { url: `https://www.facebook.com/v20.0/dialog/oauth?${params}` };
  }

  async handleOAuthCallback({ code }, verifier) {
    // TODO: exchange code -> user token -> Page access token (Pages have
    // their own long-lived tokens, separate from the user's).
    throw new Error("FacebookAdapter.handleOAuthCallback not implemented yet");
  }

  async validate(post) {
    if (!post.body?.trim() && !post.mediaUrls?.length) {
      throw new Error("Facebook post needs text or media");
    }
    return post;
  }

  async publish(account, post) {
    const pageId = account.metadata?.pageId;
    if (!pageId) throw new Error("Account missing pageId in metadata");

    const endpoint = post.mediaUrls?.length
      ? `${GRAPH_BASE}/${pageId}/photos`
      : `${GRAPH_BASE}/${pageId}/feed`;

    const body = post.mediaUrls?.length
      ? { url: post.mediaUrls[0], caption: post.body, access_token: account.accessToken }
      : { message: post.body, access_token: account.accessToken };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.id && !data.post_id) throw new Error(`Publish failed: ${JSON.stringify(data)}`);

    return { externalPostId: data.post_id || data.id, raw: data };
  }
}
