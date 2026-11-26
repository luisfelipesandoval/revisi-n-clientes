import { VideoComment, ProjectStatus } from '../types';

export type VideoSourceType =
  | { type: 'youtube'; videoId: string; originalUrl: string }
  | { type: 'mp4'; src: string }
  | { type: 'invalid'; reason: string };

/**
 * Extracts a 11-character YouTube video ID from standard watch URLs,
 * unlisted share links, Shorts URLs, embed URLs, or youtu.be links.
 */
export function extractYouTubeId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Match youtu.be/VIDEO_ID, youtube.com/watch?v=VIDEO_ID, youtube.com/shorts/VIDEO_ID, youtube.com/embed/VIDEO_ID, youtube.com/live/VIDEO_ID
  const patterns = [
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Determines whether a pasted video URL is a YouTube link or a direct MP4/video link.
 */
export function parseVideoUrl(url: string): VideoSourceType {
  const trimmed = url.trim();
  if (!trimmed) {
    return { type: 'invalid', reason: 'Ingresa un enlace de video válido.' };
  }

  const ytId = extractYouTubeId(trimmed);
  if (ytId) {
    return { type: 'youtube', videoId: ytId, originalUrl: trimmed };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return { type: 'mp4', src: trimmed };
    }
    return { type: 'invalid', reason: 'El enlace debe comenzar con http:// o https://.' };
  } catch {
    return { type: 'invalid', reason: 'Formato de enlace no reconocido. Usa un enlace de YouTube o un archivo .mp4 directo.' };
  }
}

/**
 * Formats a number of seconds into MM:SS (or HH:MM:SS if >= 1 hour).
 * Example: 19 -> "00:19", 75 -> "01:15"
 */
export function formatVideoTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hrs = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');

  if (hrs > 0) {
    const hh = String(hrs).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Parses a "MM:SS" or numeric seconds string into integer seconds.
 */
export function parseTimestampInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const val = parseInt(trimmed, 10);
    return val >= 0 && val <= 86400 ? val : null;
  }

  const parts = trimmed.split(':');
  if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1])) {
    const mins = parseInt(parts[0], 10);
    const secs = parseInt(parts[1], 10);
    if (secs >= 60) return null;
    const total = mins * 60 + secs;
    return total >= 0 && total <= 86400 ? total : null;
  }

  return null;
}

/**
 * Sorts comments ascending by videoSecond, breaking ties by creation date ascending.
 */
export function sortCommentsByTime(comments: VideoComment[]): VideoComment[] {
  return [...comments].sort((a, b) => {
    if (a.videoSecond !== b.videoSecond) {
      return a.videoSecond - b.videoSecond;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/**
 * Builds the WhatsApp contact URL when a project is Approved.
 */
export function buildWhatsAppApprovalUrl(params: {
  whatsappNumber: string;
  projectTitle: string;
  clientName: string;
  price?: number;
  currency?: string;
  showPrice?: boolean;
}): string {
  const digitsOnly = params.whatsappNumber.replace(/[^\d]/g, '');
  const priceSegment =
    params.showPrice && typeof params.price === 'number' && params.currency
      ? ` (${params.currency} ${params.price.toFixed(2)})`
      : '';
  const message = `Hola, soy ${params.clientName}. He aprobado el video "${params.projectTitle}"${priceSegment} y me gustaría coordinar el pago y la entrega final.`;
  const encodedText = encodeURIComponent(message);
  return digitsOnly
    ? `https://wa.me/${digitsOnly}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
}

/**
 * Formats price with currency symbol in Spanish format.
 */
export function formatPrice(price: number, currency: 'S/' | '$'): string {
  const safePrice = Number.isFinite(price) ? price : 0;
  const formatted = safePrice % 1 === 0 ? safePrice.toString() : safePrice.toFixed(2);
  return `${currency} ${formatted}`;
}

/**
 * Returns semantic metadata for project statuses.
 */
export function getStatusVisuals(status: ProjectStatus): {
  label: ProjectStatus;
  textColor: string;
  borderColor: string;
  bgColor: string;
} {
  switch (status) {
    case 'Aprobado':
      return {
        label: 'Aprobado',
        textColor: 'text-emerald-300',
        borderColor: 'border-emerald-500/40',
        bgColor: 'bg-emerald-950/60',
      };
    case 'Cambios solicitados':
      return {
        label: 'Cambios solicitados',
        textColor: 'text-rose-300',
        borderColor: 'border-rose-500/40',
        bgColor: 'bg-rose-950/60',
      };
    case 'En revisión':
    default:
      return {
        label: 'En revisión',
        textColor: 'text-amber-300',
        borderColor: 'border-amber-500/40',
        bgColor: 'bg-amber-950/60',
      };
  }
}
