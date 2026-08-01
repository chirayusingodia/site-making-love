import { supabase } from "@/lib/supabase";

// Client-side Cloudinary signed upload helper.
// Flow: browser → /api/cloudinary/sign-upload (signature)
//     → browser uploads file DIRECTLY to Cloudinary via XHR
//       (XHR because fetch() exposes no upload-progress events).
// Large video files never pass through our serverless functions
// and never block the UI thread — progress is reported per tick.

export interface SignResponse {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
  uploadUrl: string;
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not signed in — admin session required.");
  }
  return session.access_token;
}

export async function callAdminApi<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export function uploadToCloudinary(
  sign: SignResponse,
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ secure_url: string; public_id: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", sign.apiKey);
    form.append("timestamp", String(sign.timestamp));
    form.append("signature", sign.signature);
    form.append("folder", sign.folder);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", sign.uploadUrl);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
          resolve({ secure_url: data.secure_url, public_id: data.public_id });
        } else {
          reject(new Error(data.error?.message ?? "Cloudinary upload failed"));
        }
      } catch {
        reject(new Error("Cloudinary returned an unreadable response"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}
