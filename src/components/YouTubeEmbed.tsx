import { useState } from "react";
import { Play } from "lucide-react";

// Click-to-play YouTube facade.
//
// A live YouTube iframe pulls ~1MB of player JS plus a pile of third-party
// requests on first paint. Here the initial render is just a poster image and a
// button — the iframe is only mounted once the visitor actually asks for it.
//
// Use this for LONG-FORM video (full seva recordings, founder message). Short
// silent hero loops stay on Cloudinary video, which needs no player at all.

type Props = {
  /** YouTube video id, e.g. `dQw4w9WgXcQ`. */
  videoId: string;
  /** Accessible title — also the iframe title. */
  title: string;
  /** Override poster. Defaults to YouTube's own hqdefault thumbnail. */
  poster?: string;
  className?: string;
};

export function YouTubeEmbed({ videoId, title, poster, className = "" }: Props) {
  const [playing, setPlaying] = useState(false);
  const posterSrc = poster ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return (
    <div
      className={`relative w-full aspect-video overflow-hidden rounded-2xl bg-black ${className}`}
    >
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play video: ${title}`}
          className="group absolute inset-0 w-full h-full cursor-pointer"
        >
          <img
            src={posterSrc}
            alt={title}
            width={480}
            height={360}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="w-full h-full object-cover"
          />
          <span className="absolute inset-0 bg-black/25 group-hover:bg-black/35 transition-colors" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-16 h-16 rounded-full bg-brand text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform motion-reduce:transition-none motion-reduce:group-hover:scale-100">
              <Play size={26} className="translate-x-0.5" fill="currentColor" />
            </span>
          </span>
          <span className="absolute bottom-3 left-4 right-4 text-left text-sm font-bold text-white drop-shadow line-clamp-2">
            {title}
          </span>
        </button>
      )}
    </div>
  );
}
