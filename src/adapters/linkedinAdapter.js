import { PlatformAdapter } from "./PlatformAdapter.js";

const API_BASE = "https://api.linkedin.com/v2";

/** STUB — text + single image supported; article shares are a TODO. */
export class LinkedInAdapter extends PlatformAdapter {
  static platformKey = "LINKEDIN";

  getAuthUrl(state) {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.LINKEDIN_CLIENT_ID,
      redirect_uri: process.env.LINKEDIN_CALLBACK_URL,
      state,
      scope: "w_member_social,r_liteprofile",
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  }

  async handleOAuthCallback({ code }) {
    // TODO: POST to https://www.linkedin.com/oauth/v2/accessToken with
    // grant_type=authorization_code, then GET /v2/me for the member URN.
    throw new Error("LinkedInAdapter.handleOAuthCallback not implemented yet");
  }

  async validate(post) {
    if (!post.body?.trim()) throw new Error("LinkedIn post needs text");
    if (post.body.length > 3000) throw new Error("LinkedIn posts max out at 3000 characters");
    return post;
  }

  async publish(account, post) {
    const authorUrn = account.metadata?.memberUrn; // e.g. "urn:li:person:xxxx"
    if (!authorUrn) throw new Error("Account missing memberUrn in metadata");

    const res = await fetch(`${API_BASE}/ugcPosts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${account.accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: authorUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: post.body },
            // TODO: media asset upload flow for images (registerUpload -> PUT -> reference here)
            shareMediaCategory: post.mediaUrls?.length ? "IMAGE" : "NONE",
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Publish failed: ${JSON.stringify(data)}`);

    return { externalPostId: res.headers.get("x-restli-id") || data.id, raw: data };
  }
}
