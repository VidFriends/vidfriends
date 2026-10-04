// Direct-to-storage upload (WF-VID-2): presigned PUT, or multipart above 64 MB, with progress.
import type { ApiClient } from '@vidfriends/api-client';
import { completeUpload, createUpload, UploadContentType, type Video } from '@vidfriends/contracts';

type ContentType = (typeof UploadContentType.options)[number];

export function contentTypeFor(
  mimeType: string | null | undefined,
  name: string,
): ContentType | null {
  const parsed = UploadContentType.safeParse(mimeType);
  if (parsed.success) return parsed.data;
  if (/\.(mp4|m4v)$/i.test(name)) return 'video/mp4';
  if (/\.mov$/i.test(name)) return 'video/quicktime';
  if (/\.webm$/i.test(name)) return 'video/webm';
  if (/\.3gp$/i.test(name)) return 'video/3gpp';
  return null;
}

function put(url: string, body: Blob, contentType: string | null, onProgress: (n: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    if (contentType) xhr.setRequestHeader('content-type', contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve((xhr.getResponseHeader('etag') ?? '').replace(/"/g, ''))
        : reject(new Error(`upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('upload failed'));
    xhr.send(body);
  });
}

export async function uploadVideo(
  api: ApiClient,
  file: { uri: string; name: string; mimeType?: string | null },
  onProgress: (fraction: number) => void,
): Promise<Video> {
  const contentType = contentTypeFor(file.mimeType, file.name);
  if (!contentType) throw Object.assign(new Error('unsupported'), { code: 'unsupported_type' });
  const blob = await (await fetch(file.uri)).blob();
  const slot = await api.call(createUpload, {
    body: { bytes: blob.size, content_type: contentType },
  });
  let parts: { part_number: number; etag: string }[] | undefined;
  if (slot.put_url) {
    await put(slot.put_url, blob, contentType, (n) => onProgress(n / blob.size));
  } else if (slot.multipart) {
    const { part_size, part_urls } = slot.multipart;
    const done = new Array<number>(part_urls.length).fill(0);
    parts = [];
    for (let i = 0; i < part_urls.length; i++) {
      const etag = await put(
        part_urls[i]!,
        blob.slice(i * part_size, (i + 1) * part_size),
        null,
        (n) => {
          done[i] = n;
          onProgress(done.reduce((a, b) => a + b, 0) / blob.size);
        },
      );
      parts.push({ part_number: i + 1, etag });
    }
  }
  onProgress(1);
  const { video } = await api.call(completeUpload, {
    params: { id: slot.upload_id },
    body: { title: file.name.replace(/\.[^.]+$/, '').slice(0, 200), parts },
  });
  return video;
}
