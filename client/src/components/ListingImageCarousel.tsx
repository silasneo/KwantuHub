import { useState } from "react";

interface ListingImageCarouselProps {
  media: Array<{ id?: number; url: string; altText?: string | null }>;
  title: string;
  listingType?: string;
}

export function ListingImageCarousel({
  media,
  title,
  listingType,
}: ListingImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!media || media.length === 0) {
    return (
      <div className="h-96 sm:h-[480px] bg-[#0a0a0a] rounded overflow-hidden flex items-center justify-center relative">
        <div className="w-full h-full brand-gradient opacity-90 flex items-center justify-center p-8 text-center">
          <span className="font-serif text-white text-3xl font-bold">
            {title}
          </span>
        </div>
        {listingType && (
          <span className="absolute top-4 left-4 text-xs font-serif font-bold uppercase tracking-widest bg-white/95 text-[#0a0a0a] px-3 py-1 rounded">
            {listingType}
          </span>
        )}
      </div>
    );
  }

  const currentMedia = media[currentIndex] || media[0];

  return (
    <div className="space-y-4">
      {/* Main Display Stage */}
      <div className="relative h-96 sm:h-[480px] bg-[#0a0a0a] rounded-lg overflow-hidden flex items-center justify-center group">
        <img
          src={currentMedia.url}
          alt={currentMedia.altText || `${title} - Image ${currentIndex + 1}`}
          className="w-full h-full object-cover transition-opacity duration-300"
        />

        {/* Type Badge */}
        {listingType && (
          <span className="absolute top-4 left-4 text-xs font-serif font-bold uppercase tracking-widest bg-white/95 text-[#0a0a0a] px-3 py-1 rounded shadow-xs">
            {listingType}
          </span>
        )}

        {/* Image count badge */}
        {media.length > 1 && (
          <span className="absolute top-4 right-4 text-[11px] font-serif font-bold bg-black/70 text-white px-2.5 py-1 rounded-full backdrop-blur-xs">
            {currentIndex + 1} / {media.length}
          </span>
        )}

        {/* Arrow Navigation */}
        {media.length > 1 && (
          <>
            <button
              type="button"
              onClick={() =>
                setCurrentIndex(prev =>
                  prev === 0 ? media.length - 1 : prev - 1
                )
              }
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 hover:bg-white text-[#0a0a0a] flex items-center justify-center shadow-md transition opacity-0 group-hover:opacity-100 cursor-pointer"
              aria-label="Previous image"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() =>
                setCurrentIndex(prev =>
                  prev === media.length - 1 ? 0 : prev + 1
                )
              }
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 hover:bg-white text-[#0a0a0a] flex items-center justify-center shadow-md transition opacity-0 group-hover:opacity-100 cursor-pointer"
              aria-label="Next image"
            >
              ›
            </button>
          </>
        )}
      </div>

      {/* Thumbnails Row (up to 5 images) */}
      {media.length > 1 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {media.map((item, idx) => (
            <button
              key={item.id || idx}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`relative shrink-0 w-20 h-20 rounded overflow-hidden border-2 transition cursor-pointer ${
                currentIndex === idx
                  ? "border-[#d71466] ring-2 ring-[#d71466]/30 opacity-100 scale-95"
                  : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <img
                src={item.url}
                alt={`Thumbnail ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
