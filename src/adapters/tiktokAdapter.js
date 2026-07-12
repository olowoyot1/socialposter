import { PlatformAdapter } from "./PlatformAdapter.js";

/**
 * STUB — IMPORTANT: TikTok's Content Posting API requires your app to go
 * through TikTok's review process before you can post on behalf of any
 * account, including your own. Don't expect this to work until that's
 * approved. Video-only; no text-only or image posts.
 */
export class TikTokAdapter extends PlatformAdapter {
  static platformKey = "TIKTOK";

  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      response_type: "code",
      scope: "video.publish",
      redirect_uri: process.env.TIKTOK_CALLBACK_URL,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
  }

  async handleOAuthCallback({ code }) {
    // TODO: POST to https://open.tiktokapis.com/v2/oauth/token/
    throw new Error("TikTokAdapter.handleOAuthCallback not implemented yet");
  }

  async validate(post) {
    if (!post.mediaUrls?.length) {
      throw new Error("TikTok requires a video — text/image-only posts aren't supported");
    }
    return post;
  }

  async publish(account, post) {
    // TODO: Content Posting API — POST /v2/post/publish/video/init/ then
    // upload the video bytes to the returned upload URL.
    throw new Error(
      "TikTokAdapter.publish not implemented — also requires TikTok app review " +
        "before this will work at all"
    );
  }
}
