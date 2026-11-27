import {
  VideoComment,
  ProjectStatus,
  DisplayProjectStatus,
  ProjectType,
} from '../types';

export const YAPE_NUMBER_DISPLAY = '915 978 491';
export const YAPE_NUMBER_RAW = '915978491';

export type VideoSourceType =
  | { type: 'mp4'; src: string }
  | { type: 'invalid'; reason: string };

/**
 * Validates that a pasted video URL is a direct HTTP/HTTPS link to an .mp4 video
 * (and explicitly rejects YouTube links since only direct .mp4 files are supported).
 */
export function parseVideoUrl(url: string): VideoSourceType {
  const trimmed = url.trim();
  if (!trimmed) {
    return { type: 'invalid', reason: 'Ingresa un enlace directo a un archivo .mp4.' };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { type: 'invalid', reason: 'El enlace debe comenzar con http:// o https://.' };
    }
    const host = parsed.hostname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      return {
        type: 'invalid',
        reason: 'Solo se admiten enlaces directos a archivos .mp4 (no enlaces de YouTube).',
      };
    }
    return { type: 'mp4', src: trimmed };
  } catch {
    return {
      type: 'invalid',
      reason: 'Formato de enlace no válido. Ingresa una URL directa a un archivo .mp4.',
    };
  }
}

/**
 * Parses one or more image URLs pasted one per line (JPG, PNG, Cloudinary, etc.).
 */
export function parseImageUrlsFromText(text: string): {
  validUrls: string[];
  invalidLines: string[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const validUrls: string[] = [];
  const invalidLines: string[] = [];

  for (const line of lines) {
    try {
      const parsed = new URL(line);
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        line.length <= 500
      ) {
        validUrls.push(line);
      } else {
        invalidLines.push(line);
      }
    } catch {
      invalidLines.push(line);
    }
  }

  return { validUrls, invalidLines };
}

/**
 * Checks if a final delivery file URL points to Google Drive.
 */
export function isGoogleDriveUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'drive.google.com' ||
      host.endsWith('.drive.google.com') ||
      host === 'docs.google.com' ||
      host.endsWith('.docs.google.com')
    );
  } catch {
    return false;
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
 * Sorts comments ascending by videoSecond (for video projects) or imageNumber (for images projects),
 * breaking ties by creation date ascending.
 */
export function sortCommentsByTime(
  comments: VideoComment[],
  projectType: ProjectType = 'video'
): VideoComment[] {
  return [...comments].sort((a, b) => {
    if (projectType === 'images') {
      const imgA = a.imageNumber ?? 1;
      const imgB = b.imageNumber ?? 1;
      if (imgA !== imgB) {
        return imgA - imgB;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    }

    if (a.videoSecond !== b.videoSecond) {
      return a.videoSecond - b.videoSecond;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/**
 * Builds the WhatsApp URL to send the Yape payment screenshot for the project.
 * Opens https://wa.me/51915978491 with a prefilled message containing the project title.
 */
export function buildYapeWhatsAppUrl(projectTitle: string): string {
  const safeTitle = projectTitle.trim() || 'Video';
  const message = `Hola, te envío la captura del pago por Yape del proyecto "${safeTitle}".`;
  return `https://wa.me/51915978491?text=${encodeURIComponent(message)}`;
}

/**
 * Formats the final video download filename as "[título del proyecto].mp4".
 */
export function formatFinalVideoFilename(projectTitle: string): string {
  const cleaned = projectTitle.trim() || 'video';
  return cleaned.toLowerCase().endsWith('.mp4') ? cleaned : `${cleaned}.mp4`;
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
 * Returns monochrome visual classes for project statuses:
 * - "En revisión": dotted/dashed border (borde punteado)
 * - "Cambios solicitados": solid white border (borde sólido)
 * - "Aprobado" / "Entregado": white background with black text (fondo blanco con texto negro)
 */
export function getStatusVisuals(status: DisplayProjectStatus): {
  label: DisplayProjectStatus;
  badgeClass: string;
  listTextClass: string;
} {
  switch (status) {
    case 'Entregado':
      return {
        label: 'Entregado',
        badgeClass: 'bg-white text-black border border-solid border-white font-semibold',
        listTextClass: 'bg-white text-black px-2 py-0.5 rounded font-semibold',
      };
    case 'Aprobado':
      return {
        label: 'Aprobado',
        badgeClass: 'bg-white text-black border border-solid border-white font-semibold',
        listTextClass: 'bg-white text-black px-2 py-0.5 rounded font-semibold',
      };
    case 'Cambios solicitados':
      return {
        label: 'Cambios solicitados',
        badgeClass: 'bg-transparent text-white border border-solid border-white font-medium',
        listTextClass: 'text-white border border-solid border-white px-2 py-0.5 rounded font-medium',
      };
    case 'En revisión':
    default:
      return {
        label: 'En revisión',
        badgeClass: 'bg-transparent text-neutral-200 border border-dashed border-neutral-400 font-medium',
        listTextClass: 'text-neutral-300 border border-dashed border-neutral-500 px-2 py-0.5 rounded font-medium',
      };
  }
}

/**
 * Returns the delivery badge label for the Admin project list:
 * - "Entregado" when descargaHabilitada === true
 * - "Pago pendiente" when status === 'Aprobado' and descargaHabilitada === false
 * - null otherwise
 */
export function getAdminDeliveryBadge(
  status: ProjectStatus,
  descargaHabilitada: boolean
): { label: 'Pago pendiente' | 'Entregado'; badgeClass: string } | null {
  if (descargaHabilitada) {
    return {
      label: 'Entregado',
      badgeClass: 'bg-white text-black border border-solid border-white px-2 py-0.5 rounded font-semibold',
    };
  }
  if (status === 'Aprobado') {
    return {
      label: 'Pago pendiente',
      badgeClass: 'bg-transparent text-white border border-dashed border-white px-2 py-0.5 rounded font-medium',
    };
  }
  return null;
}

export type StatusConfirmationAction =
  | 'approve'
  | 'remove-approval'
  | 'request-changes';

/**
 * Returns exact confirmation modal copy and target status for client status actions.
 */
export function getStatusConfirmationConfig(action: StatusConfirmationAction): {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  targetStatus: ProjectStatus;
  opensYapeModal: boolean;
} {
  switch (action) {
    case 'approve':
      return {
        message: '¿Aprobar este video? Al aprobar se mostrará el método de pago.',
        confirmLabel: 'Sí, aprobar',
        cancelLabel: 'Cancelar',
        targetStatus: 'Aprobado',
        opensYapeModal: true,
      };
    case 'remove-approval':
      return {
        message:
          "¿Seguro que quieres quitar la aprobación? El proyecto volverá a 'En revisión'.",
        confirmLabel: 'Sí, quitar',
        cancelLabel: 'Cancelar',
        targetStatus: 'En revisión',
        opensYapeModal: false,
      };
    case 'request-changes':
      return {
        message: '¿Solicitar cambios en este video?',
        confirmLabel: 'Sí',
        cancelLabel: 'Cancelar',
        targetStatus: 'Cambios solicitados',
        opensYapeModal: false,
      };
  }
}
