import { contentTypeFor } from './upload';

describe('contentTypeFor', () => {
  it('prefers the MIME type, falls back to the extension, rejects others', () => {
    expect(contentTypeFor('video/quicktime', 'x.bin')).toBe('video/quicktime');
    expect(contentTypeFor(null, 'clip.MP4')).toBe('video/mp4');
    expect(contentTypeFor('application/octet-stream', 'clip.mov')).toBe('video/quicktime');
    expect(contentTypeFor('image/png', 'a.png')).toBeNull();
  });
});
