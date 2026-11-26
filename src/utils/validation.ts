import { ProjectStatus, CurrencyCode } from '../types';

export const ADMIN_EMAIL = 'chat.gpt.sandoval@gmail.com';

export const VALID_STATUSES: ProjectStatus[] = [
  'En revisión',
  'Cambios solicitados',
  'Aprobado',
];

export const VALID_CURRENCIES: CurrencyCode[] = ['S/', '$'];

export const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export function isValidId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length >= 1 &&
    id.length <= 128 &&
    ID_REGEX.test(id)
  );
}

export function isAuthorizedAdminUser(
  user: { uid?: string; email?: string | null; emailVerified?: boolean } | null | undefined
): boolean {
  if (!user) return false;
  return (
    user.emailVerified === true &&
    typeof user.email === 'string' &&
    user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );
}

const ALLOWED_PROJECT_KEYS = new Set([
  'title',
  'clientName',
  'videoUrl',
  'price',
  'currency',
  'showPrice',
  'watermarkEnabled',
  'watermarkText',
  'status',
  'whatsappNumber',
  'createdAt',
  'updatedAt',
]);

export function validateProjectPayload(data: Record<string, unknown>): boolean {
  if (!data || typeof data !== 'object') return false;
  const keys = Object.keys(data);
  if (keys.length !== ALLOWED_PROJECT_KEYS.size) return false;
  for (const k of keys) {
    if (!ALLOWED_PROJECT_KEYS.has(k)) return false;
  }

  const {
    title,
    clientName,
    videoUrl,
    price,
    currency,
    showPrice,
    watermarkEnabled,
    watermarkText,
    status,
    whatsappNumber,
  } = data;

  if (typeof title !== 'string' || title.length < 1 || title.length > 120) return false;
  if (typeof clientName !== 'string' || clientName.length < 1 || clientName.length > 100) return false;
  if (typeof videoUrl !== 'string' || videoUrl.length < 1 || videoUrl.length > 500) return false;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 100000000) return false;
  if (typeof currency !== 'string' || !VALID_CURRENCIES.includes(currency as CurrencyCode)) return false;
  if (typeof showPrice !== 'boolean') return false;
  if (typeof watermarkEnabled !== 'boolean') return false;
  if (typeof watermarkText !== 'string' || watermarkText.length > 100) return false;
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as ProjectStatus)) return false;
  if (typeof whatsappNumber !== 'string' || whatsappNumber.length > 30) return false;

  return true;
}

export function validateClientStatusUpdate(updatePayload: Record<string, unknown>): boolean {
  if (!updatePayload || typeof updatePayload !== 'object') return false;
  const keys = Object.keys(updatePayload);
  if (keys.length !== 1 || keys[0] !== 'status') return false;
  const status = updatePayload.status;
  return typeof status === 'string' && VALID_STATUSES.includes(status as ProjectStatus);
}

const ALLOWED_COMMENT_KEYS = new Set([
  'projectId',
  'authorName',
  'text',
  'videoSecond',
  'createdAt',
  'resolved',
]);

export function validateCommentCreatePayload(
  data: Record<string, unknown>,
  parentProjectExists = true
): boolean {
  if (!parentProjectExists) return false;
  if (!data || typeof data !== 'object') return false;
  const keys = Object.keys(data);
  if (keys.length !== ALLOWED_COMMENT_KEYS.size) return false;
  for (const k of keys) {
    if (!ALLOWED_COMMENT_KEYS.has(k)) return false;
  }

  const { projectId, authorName, text, videoSecond, resolved } = data;
  if (!isValidId(projectId)) return false;
  if (typeof authorName !== 'string' || authorName.trim().length < 1 || authorName.length > 80) return false;
  if (typeof text !== 'string' || text.trim().length < 1 || text.length > 1000) return false;
  if (typeof videoSecond !== 'number' || !Number.isFinite(videoSecond) || videoSecond < 0 || videoSecond > 86400) return false;
  if (resolved !== false) return false;

  return true;
}
