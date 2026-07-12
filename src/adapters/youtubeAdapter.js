import { PlatformAdapter } from "./PlatformAdapter.js";

/**
 * STUB — YouTube Data API v3, resumable upload for Shorts (video < 60s,
 * vertical aspect ratio). Quota-limited: a single video upload costs 1600
 * of your daily 10,000 quota units by default, so this can't be spammed.
 */
export class YouTubeAdapter extends PlatformAdapter {
  static platformKey = "YOUTUBE";

  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID,
      redirect_uri: process.env.YOUTUBE_CALLBACK_URL,
      response_type: "code",
      access_type: "offline",
      scope: "https://www.googleapis.com/auth/youtube.upload",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async handleOAuthCallback({ code }) {
    // TODO: POST to https://oauth2.googleapis.com/token
    throw new Error("YouTubeAdapter.handleOAuthCallback not implemented yet");
  }

  async validate(post) {
    if (!post.mediaUrls?.length) {
      throw new Error("YouTube Shorts requires a video file");
    }
    return post;
  }

  async publish(account, post) {
    // TODO: resumable upload — POST to
    // https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable
    // with snippet.title/description, then PUT the video bytes in chunks.
    throw new Error("YouTubeAdapter.publish not implemented yet");
  }
}
