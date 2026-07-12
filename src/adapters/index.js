import { TwitterAdapter } from "./twitterAdapter.js";
import { InstagramAdapter } from "./instagramAdapter.js";
import { FacebookAdapter } from "./facebookAdapter.js";
import { LinkedInAdapter } from "./linkedinAdapter.js";
import { TikTokAdapter } from "./tiktokAdapter.js";
import { YouTubeAdapter } from "./youtubeAdapter.js";

// Adding a new platform: implement PlatformAdapter, then add one line here.
const registry = {
  TWITTER: new TwitterAdapter(),
  INSTAGRAM: new InstagramAdapter(),
  FACEBOOK: new FacebookAdapter(),
  LINKEDIN: new LinkedInAdapter(),
  TIKTOK: new TikTokAdapter(),
  YOUTUBE: new YouTubeAdapter(),
};

export function getAdapter(platformKey) {
  const adapter = registry[platformKey];
  if (!adapter) throw new Error(`No adapter registered for platform "${platformKey}"`);
  return adapter;
}

export function listPlatforms() {
  return Object.keys(registry);
}
