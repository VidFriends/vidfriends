// Direct-to-storage upload with progress (WF-VID-2): presigned PUT, or multipart above 64 MB.
import type { ApiClient } from '@vidfriends/api-client';
import { completeUpload, createUpload, UploadContentType, type Video } from '@vidfriends/contracts';

function put(
  url: string,
  body: Blob,
  contentType: string | null,
  onProgress: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
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

export function uploadContentType(file: File): (typeof UploadContentType.options)[number] | null {
  const parsed = UploadContentType.safeParse(file.type);
  if (parsed.success) return parsed.data;
  if (/\.(mp4|m4v)$/i.test(file.name)) return 'video/mp4';
  if (/\.mov$/i.test(file.name)) return 'video/quicktime';
  if (/\.webm$/i.test(file.name)) return 'video/webm';
  return null;
}

export async function uploadVideo(
  api: ApiClient,
  file: File,
  contentType: (typeof UploadContentType.options)[number],
  onProgress: (fraction: number) => void,
): Promise<Video> {
  const slot = await api.call(createUpload, {
    body: { bytes: file.size, content_type: contentType },
  });
  let parts: { part_number: number; etag: string }[] | undefined;
  if (slot.put_url) {
    await put(slot.put_url, file, contentType, (loaded) => onProgress(loaded / file.size));
  } else if (slot.multipart) {
    const { part_size, part_urls } = slot.multipart;
    const done = new Array<number>(part_urls.length).fill(0);
    parts = [];
    for (let i = 0; i < part_urls.length; i++) {
      const blob = file.slice(i * part_size, (i + 1) * part_size);
      const etag = await put(part_urls[i] as string, blob, null, (loaded) => {
        done[i] = loaded;
        onProgress(done.reduce((a, b) => a + b, 0) / file.size);
      });
      parts.push({ part_number: i + 1, etag });
    }
  }
  onProgress(1);
  const title = file.name.replace(/\.[^.]+$/, '').slice(0, 200);
  const { video } = await api.call(completeUpload, {
    params: { id: slot.upload_id },
    body: { title, parts },
  });
  return video;
}
