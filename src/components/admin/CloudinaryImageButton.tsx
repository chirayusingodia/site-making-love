import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callAdminApi, uploadToCloudinary } from "@/lib/cloudinary-upload";
import type { SignResponse } from "@/lib/cloudinary-upload";

// Shared signed-upload button — used by every admin photo control
// (SEO/blog images, plan cards, /admin/images). Flow: sign → browser
// uploads DIRECTLY to Cloudinary via XHR → onUploaded fires only on
// success. A failed or cancelled upload never calls onUploaded, so
// whatever is already saved/live is left completely untouched.
export function CloudinaryImageButton({
  folder,
  label,
  onUploaded,
}: {
  folder: string;
  label: string;
  onUploaded: (secureUrl: string, publicId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleFile(file: File) {
    setErr(null);
    setProgress(0);
    try {
      const sign = await callAdminApi<SignResponse>("/api/cloudinary/sign-upload", {
        folder,
        resourceType: "image",
      });
      const { secure_url, public_id } = await uploadToCloudinary(sign, file, setProgress);
      onUploaded(secure_url, public_id);
      setProgress(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
      setProgress(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={progress != null}
        className="gap-1.5 text-xs"
      >
        {progress != null ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Upload className="w-3.5 h-3.5" />
        )}
        {progress != null ? `Uploading ${progress}%` : label}
      </Button>
      {err && <div className="text-[11px] text-rose-600">{err}</div>}
    </div>
  );
}
