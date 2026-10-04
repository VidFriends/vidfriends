// Object key scheme (ADR-0009, LLD §4). Keys are opaque ids only — never user input (NFR-SEC-08).
export const keys = {
  avatarUpload: (userId: string, uploadId: string) => `tmp/avatars/${userId}/${uploadId}`,
  avatar: (userId: string, version: string) => `avatars/${userId}/${version}.webp`,
  upload: (uploadId: string) => `uploads/${uploadId}`,
  media: (videoId: string, rendition = 'main') => `media/${videoId}/${rendition}.mp4`,
  thumb: (videoId: string) => `thumbs/${videoId}.webp`,
};

/** Prefixes owned by the database; anything else in the bucket is an orphan (NFR-REL-05). */
export const KEY_PREFIXES = ['tmp/', 'avatars/', 'uploads/', 'media/', 'thumbs/'] as const;
