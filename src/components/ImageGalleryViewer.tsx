import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  X,
  Image as ImageIcon,
} from 'lucide-react';

interface ImageGalleryViewerProps {
  imageUrls: string[];
  currentIndex: number;
  onChangeIndex: (index: number) => void;
  watermarkEnabled: boolean;
  watermarkText: string;
  commentImageNumbers?: number[];
}

export const ImageGalleryViewer: React.FC<ImageGalleryViewerProps> = ({
  imageUrls,
  currentIndex,
  onChangeIndex,
  watermarkEnabled,
  watermarkText,
  commentImageNumbers = [],
}) => {
  const [isZoomOpen, setIsZoomOpen] = useState<boolean>(false);
  const [zoomScale, setZoomScale] = useState<number>(1.6);

  const total = imageUrls.length;
  const safeIndex = total > 0 ? Math.min(Math.max(0, currentIndex), total - 1) : 0;
  const currentUrl = imageUrls[safeIndex] || '';
  const displayWatermark = watermarkText.trim() || 'VISTA PREVIA';

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (total <= 1) return;
    onChangeIndex((safeIndex - 1 + total) % total);
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (total <= 1) return;
    onChangeIndex((safeIndex + 1) % total);
  };

  const preventImageActions = (e: React.SyntheticEvent) => {
    e.preventDefault();
  };

  if (total === 0) {
    return (
      <div className="w-full aspect-[4/5] max-h-[580px] bg-[#0A0A0A] border border-[#2A2A2A] rounded-2xl flex flex-col items-center justify-center p-6 text-center space-y-2">
        <ImageIcon className="w-8 h-8 text-neutral-500" />
        <p className="text-sm text-neutral-400">
          No hay imágenes cargadas en este proyecto.
        </p>
      </div>
    );
  }

  return (
    <div
      className="w-full flex flex-col items-center space-y-3 select-none"
      onContextMenu={preventImageActions}
      data-testid="image-gallery-viewer"
    >
      {/* Main Image Frame */}
      <div className="relative w-full bg-[#0A0A0A] border border-[#2A2A2A] rounded-2xl overflow-hidden flex items-center justify-center min-h-[360px] sm:min-h-[480px] max-h-[640px]">
        {/* Counter Badge ("3 / 8") */}
        <div
          className="absolute top-3 left-3 z-20 px-3 py-1 rounded-lg bg-black/80 border border-[#2A2A2A] font-mono tabular-nums text-xs font-semibold text-white pointer-events-none"
          data-testid="image-gallery-counter"
        >
          {safeIndex + 1} / {total}
        </div>

        {/* Zoom indicator badge */}
        <button
          type="button"
          onClick={() => {
            setZoomScale(1.6);
            setIsZoomOpen(true);
          }}
          className="absolute top-3 right-3 z-20 px-2.5 py-1 rounded-lg bg-black/80 hover:bg-white hover:text-black border border-[#2A2A2A] text-xs font-medium text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Toca para hacer zoom"
        >
          <ZoomIn className="w-3.5 h-3.5" />
          <span>Zoom</span>
        </button>

        {/* Clickable Image Container (full image without cropping: object-contain) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            setZoomScale(1.6);
            setIsZoomOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setZoomScale(1.6);
              setIsZoomOpen(true);
            }
          }}
          className="relative w-full h-full flex items-center justify-center p-2 sm:p-4 cursor-zoom-in"
          data-testid="image-gallery-main-trigger"
        >
          <img
            src={currentUrl}
            alt={`Imagen ${safeIndex + 1} de ${total}`}
            draggable={false}
            onContextMenu={preventImageActions}
            onDragStart={preventImageActions}
            className="max-w-full max-h-[560px] w-auto h-auto object-contain rounded-lg select-none pointer-events-none"
          />

          {/* Optional Watermark Layer with pointer-events: none */}
          {watermarkEnabled && (
            <div
              className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden flex flex-col items-center justify-around p-4"
              aria-hidden="true"
              data-testid="image-watermark-overlay"
            >
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="-rotate-24 whitespace-nowrap text-white/25 font-bold uppercase tracking-[0.25em] text-xs sm:text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                >
                  {displayWatermark} &nbsp;·&nbsp; {displayWatermark}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Left / Right Navigation Arrows */}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Imagen anterior"
              data-testid="image-prev-btn"
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/80 hover:bg-white text-white hover:text-black border border-white/40 hover:border-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={handleNext}
              aria-label="Imagen siguiente"
              data-testid="image-next-btn"
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/80 hover:bg-white text-white hover:text-black border border-white/40 hover:border-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnails Strip below the viewer */}
      <div
        className="w-full flex items-center gap-2 overflow-x-auto py-1.5 px-1"
        data-testid="image-thumbnails-strip"
      >
        {imageUrls.map((url, idx) => {
          const isCurrent = idx === safeIndex;
          const imgNumber = idx + 1;
          const hasComment = commentImageNumbers.includes(imgNumber);

          return (
            <button
              key={`${idx}-${url}`}
              type="button"
              onClick={() => onChangeIndex(idx)}
              onContextMenu={preventImageActions}
              data-testid={`image-thumbnail-${imgNumber}`}
              className={`relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border transition-all cursor-pointer bg-[#0A0A0A] ${
                isCurrent
                  ? 'border-2 border-white opacity-100'
                  : 'border-[#2A2A2A] opacity-60 hover:opacity-90'
              }`}
            >
              <img
                src={url}
                alt={`Miniatura ${imgNumber}`}
                draggable={false}
                onContextMenu={preventImageActions}
                onDragStart={preventImageActions}
                className="w-full h-full object-contain p-0.5 select-none pointer-events-none"
              />
              <span className="absolute bottom-1 left-1 px-1.5 py-0.2 rounded bg-black/80 font-mono text-[10px] font-bold text-white">
                {imgNumber}
              </span>
              {hasComment && (
                <span
                  className="absolute top-1 right-1 w-2 h-2 rounded-full bg-white border border-black"
                  title="Tiene comentarios"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Fullscreen Zoom Modal when touching/clicking the image */}
      {isZoomOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-4 select-none"
          onContextMenu={preventImageActions}
          role="dialog"
          aria-modal="true"
          data-testid="image-zoom-modal"
        >
          {/* Top Bar inside Zoom */}
          <div className="flex items-center justify-between gap-3 z-20">
            <span className="px-3 py-1.5 rounded-xl bg-[#111111] border border-[#2A2A2A] font-mono tabular-nums text-xs font-semibold text-white">
              {safeIndex + 1} / {total}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setZoomScale((prev) => (prev >= 2.2 ? 1 : prev + 0.6))
                }
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#111111] hover:bg-white hover:text-black border border-white text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {zoomScale > 1 ? (
                  <>
                    <ZoomOut className="w-4 h-4" />
                    <span>100%</span>
                  </>
                ) : (
                  <>
                    <ZoomIn className="w-4 h-4" />
                    <span>Ampliar</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsZoomOpen(false)}
                data-testid="close-image-zoom-btn"
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Cerrar</span>
              </button>
            </div>
          </div>

          {/* Center Zoomed Image Container */}
          <div
            className="relative flex-1 overflow-auto flex items-center justify-center my-2 cursor-zoom-out"
            onClick={() => setIsZoomOpen(false)}
          >
            <div
              className="relative inline-flex items-center justify-center transition-transform duration-150"
              onClick={(e) => {
                e.stopPropagation();
                setZoomScale((prev) => (prev > 1 ? 1 : 1.75));
              }}
            >
              <img
                src={currentUrl}
                alt={`Imagen ${safeIndex + 1} ampliada`}
                draggable={false}
                onContextMenu={preventImageActions}
                onDragStart={preventImageActions}
                className={`object-contain select-none pointer-events-none transition-all duration-150 ${
                  zoomScale > 1
                    ? 'max-w-[92vw] max-h-[85vh] scale-125 sm:scale-150'
                    : 'max-w-[90vw] max-h-[80vh] scale-100'
                }`}
              />

              {/* Watermark stays visible in Zoom too with pointer-events: none */}
              {watermarkEnabled && (
                <div
                  className="absolute inset-0 z-10 pointer-events-none select-none overflow-hidden flex flex-col items-center justify-around p-6"
                  aria-hidden="true"
                >
                  {[0, 1, 2, 3].map((row) => (
                    <div
                      key={row}
                      className="-rotate-24 whitespace-nowrap text-white/25 font-bold uppercase tracking-[0.25em] text-sm sm:text-base drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
                    >
                      {displayWatermark} &nbsp;·&nbsp; {displayWatermark} &nbsp;·&nbsp; {displayWatermark}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrev}
                  aria-label="Imagen anterior"
                  className="fixed left-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/80 hover:bg-white text-white hover:text-black border border-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  aria-label="Imagen siguiente"
                  className="fixed right-4 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/80 hover:bg-white text-white hover:text-black border border-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
