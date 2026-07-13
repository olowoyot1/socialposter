import { PlatformAdapter } from "./PlatformAdapter.js";

const GRAPH_BASE = "https://graph.facebook.com/v20.0";

/**
 * STUB — shape is correct, fill in once you have a Meta App + a Business/
 * Creator Instagram account linked to a Facebook Page.
 *
 * Key constraint: Instagram's Graph API does NOT accept direct file upload.
 * `mediaUrls` must already be publicly hosted (e.g. your S3 bucket) before
 * calling publish() — the API fetches the image/video from that URL itself.
 */
export class InstagramAdapter extends PlatformAdapter {
  static platformKey = "INSTAGRAM";

  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID,
      redirect_uri: process.env.META_CALLBACK_URL,
      state,
      scope: "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement",
      response_type: "code",
    });
    return { url: `https://www.facebook.com/v20.0/dialog/oauth?${params}` };
  }

  async handleOAuthCallback({ code }, verifier) {
    // TODO: exchange `code` for a short-lived token, then a long-lived token,
    // then look up the Page -> connected Instagram Business Account id.
    // See: https://developers.facebook.com/docs/instagram-api/getting-started
    throw new Error("InstagramAdapter.handleOAuthCallback not implemented yet");
  }

  async validate(post) {
    if (!post.mediaUrls?.length) {
      throw new Error("Instagram requires at least one image or video");
    }
    if (post.body.length > 2200) {
      throw new Error("Instagram captions max out at 2200 characters");
    }
    return post;
  }

  async publish(account, post) {
    const igUserId = account.metadata?.igBusinessAccountId;
    if (!igUserId) throw new Error("Account missing igBusinessAccountId in metadata");

    // Step 1: create a media container
    const containerRes = await fetch(`${GRAPH_BASE}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: post.mediaUrls[0], // TODO: handle video + carousels
        caption: post.body,
        access_token: account.accessToken,
      }),
    });
    const container = await containerRes.json();
    if (!container.id) throw new Error(`Container creation failed: ${JSON.stringify(container)}`);

    // Step 2: publish the container
    const publishRes = await fetch(`${GRAPH_BASE}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: container.id,
        access_token: account.accessToken,
      }),
    });
    const published = await publishRes.json();
    if (!published.id) throw new Error(`Publish failed: ${JSON.stringify(published)}`);

    return { externalPostId: published.id, raw: published };
  }
}
