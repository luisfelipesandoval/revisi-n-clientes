import {
  ProjectStatus,
  CurrencyCode,
  Cliente,
  Project,
  VisibleProjectSummary,
} from '../types';

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

/**
 * Generates a cryptographically random alphanumeric ID of at least 20 characters (default 28)
 * so client project links (/ver/ID_DEL_PROYECTO) and client profile links (/cliente/ID_DEL_CLIENTE) cannot be guessed.
 */
export function generateSecureProjectId(length = 28): string {
  const safeLength = Math.max(20, Math.min(64, length));
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const randomValues = new Uint32Array(safeLength);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(randomValues);
  } else {
    for (let i = 0; i < safeLength; i++) {
      randomValues[i] = Math.floor(Math.random() * charset.length);
    }
  }
  let result = '';
  for (let i = 0; i < safeLength; i++) {
    result += charset[randomValues[i] % charset.length];
  }
  return result;
}

export type AppRoute =
  | { view: 'admin' }
  | { view: 'client'; projectId: string }
  | { view: 'client-portal'; clientId: string }
  | { view: 'invalid-client-link' };

/**
 * Parses window.location.pathname into strictly separated zones:
 * - "/" -> Admin zone
 * - "/ver/ID_DEL_PROYECTO" -> Independent public Client project page
 * - "/cliente/ID_DEL_CLIENTE" -> Independent public Client project list page
 */
export function parseRoutePath(pathname: string): AppRoute {
  const clean = pathname.trim();
  if (clean === '' || clean === '/') {
    return { view: 'admin' };
  }

  if (clean.startsWith('/ver')) {
    const match = clean.match(/^\/ver\/([^/]+)\/?$/);
    if (!match || !match[1]) {
      return { view: 'invalid-client-link' };
    }
    const rawId = decodeURIComponent(match[1]);
    if (!isValidId(rawId)) {
      return { view: 'invalid-client-link' };
    }
    return { view: 'client', projectId: rawId };
  }

  if (clean.startsWith('/cliente')) {
    const match = clean.match(/^\/cliente\/([^/]+)\/?$/);
    if (!match || !match[1]) {
      return { view: 'invalid-client-link' };
    }
    const rawId = decodeURIComponent(match[1]);
    if (!isValidId(rawId)) {
      return { view: 'invalid-client-link' };
    }
    return { view: 'client-portal', clientId: rawId };
  }

  return { view: 'invalid-client-link' };
}

/**
 * Normalizes a client name for accent-insensitive and case-insensitive matching.
 */
export function normalizeClientName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes Levenshtein edit distance between two normalized strings to catch near-duplicates.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Filters saved clients matching the typed query without distinguishing uppercase or accents.
 */
export function filterMatchingClients(
  clients: Cliente[],
  query: string
): Cliente[] {
  const normQuery = normalizeClientName(query);
  if (!normQuery) return clients;
  return clients.filter((c) => normalizeClientName(c.name).includes(normQuery));
}

/**
 * Detects if a typed client name is identical (ignoring case/accents, e.g., "Dreyzon" vs "dreyzon")
 * or almost identical (1-char typo for names >= 4 chars) to an already saved client.
 */
export function findSimilarExistingClient(
  clients: Cliente[],
  inputName: string
): Cliente | null {
  const normInput = normalizeClientName(inputName);
  if (!normInput) return null;

  // 1) Exact normalized match (case/accent insensitive, e.g. "Dreyzon" vs "dreyzon")
  const exactNorm = clients.find(
    (c) => normalizeClientName(c.name) === normInput
  );
  if (exactNorm) return exactNorm;

  // 2) Near-duplicate (Levenshtein distance === 1 for names >= 4 chars)
  if (normInput.length >= 4) {
    const nearMatch = clients.find((c) => {
      const normCandidate = normalizeClientName(c.name);
      return (
        normCandidate.length >= 4 &&
        levenshteinDistance(normInput, normCandidate) === 1
      );
    });
    if (nearMatch) return nearMatch;
  }

  return null;
}

/**
 * Builds the sanitized visibleProjects summary array stored inside clientes/{clientId}.
 * Only includes projects with mostrarEnListaCliente !== false.
 * Never includes finalVideoUrl, and only includes price when showPrice is true.
 */
export function buildVisibleProjectsSummary(
  projects: Project[],
  clientId: string
): VisibleProjectSummary[] {
  const matching = projects
    .filter(
      (p) => p.clientId === clientId && p.mostrarEnListaCliente !== false
    )
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 200);

  return matching.map((p) => {
    const summary: VisibleProjectSummary = {
      id: p.id,
      title: p.title,
      projectType: p.projectType === 'images' ? 'images' : 'video',
      status: p.descargaHabilitada ? 'Entregado' : p.status,
      showPrice: Boolean(p.showPrice),
      currency: p.currency,
    };
    if (p.showPrice) {
      summary.price = p.price;
    }
    return summary;
  });
}

export function isAuthorizedAdminUser(
  user: { uid?: string; email?: string | null; emailVerified?: boolean } | null | undefined
): boolean {
  if (!user) return false;
  if (user.emailVerified === false) return false;
  return (
    typeof user.email === 'string' &&
    user.email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );
}

const REQUIRED_PROJECT_KEYS = [
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
];

const ALLOWED_PROJECT_KEYS = new Set([
  ...REQUIRED_PROJECT_KEYS,
  'descargaHabilitada',
  'clientId',
  'projectType',
  'mostrarEnListaCliente',
  'imageUrls',
  'finalFileNames',
]);

export function validateProjectPayload(data: Record<string, unknown>): boolean {
  if (!data || typeof data !== 'object') return false;
  const keys = Object.keys(data);
  for (const reqKey of REQUIRED_PROJECT_KEYS) {
    if (!(reqKey in data)) return false;
  }
  for (const k of keys) {
    if (!ALLOWED_PROJECT_KEYS.has(k)) return false;
  }

  const {
    title,
    clientName,
    clientId,
    projectType,
    mostrarEnListaCliente,
    videoUrl,
    imageUrls,
    finalFileNames,
    price,
    currency,
    showPrice,
    watermarkEnabled,
    watermarkText,
    status,
    whatsappNumber,
    descargaHabilitada,
  } = data;

  if (typeof title !== 'string' || title.length < 1 || title.length > 120) return false;
  if (typeof clientName !== 'string' || clientName.length < 1 || clientName.length > 100) return false;
  if (clientId !== undefined && (typeof clientId !== 'string' || clientId.length > 128)) return false;
  if (
    projectType !== undefined &&
    projectType !== 'video' &&
    projectType !== 'images'
  ) {
    return false;
  }
  if (mostrarEnListaCliente !== undefined && typeof mostrarEnListaCliente !== 'boolean') return false;
  if (typeof videoUrl !== 'string' || videoUrl.length > 500) return false;
  if (
    imageUrls !== undefined &&
    (!Array.isArray(imageUrls) || imageUrls.length > 200)
  ) {
    return false;
  }
  if (
    projectType === 'images' &&
    (!Array.isArray(imageUrls) || imageUrls.length === 0)
  ) {
    return false;
  }
  if (
    finalFileNames !== undefined &&
    (!Array.isArray(finalFileNames) || finalFileNames.length > 100)
  ) {
    return false;
  }
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 100000000) return false;
  if (typeof currency !== 'string' || !VALID_CURRENCIES.includes(currency as CurrencyCode)) return false;
  if (typeof showPrice !== 'boolean') return false;
  if (typeof watermarkEnabled !== 'boolean') return false;
  if (typeof watermarkText !== 'string' || watermarkText.length > 100) return false;
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as ProjectStatus)) return false;
  if (typeof whatsappNumber !== 'string' || whatsappNumber.length > 30) return false;
  if (descargaHabilitada !== undefined && typeof descargaHabilitada !== 'boolean') return false;

  return true;
}

const ALLOWED_CLIENTE_KEYS = new Set([
  'name',
  'note',
  'visibleProjects',
  'createdAt',
  'updatedAt',
]);

export function validateClientePayload(data: Record<string, unknown>): boolean {
  if (!data || typeof data !== 'object') return false;
  const keys = Object.keys(data);
  if (keys.length !== ALLOWED_CLIENTE_KEYS.size) return false;
  for (const k of keys) {
    if (!ALLOWED_CLIENTE_KEYS.has(k)) return false;
  }

  const { name, note, visibleProjects } = data;
  if (typeof name !== 'string' || name.trim().length < 1 || name.length > 100) return false;
  if (typeof note !== 'string' || note.length > 500) return false;
  if (!Array.isArray(visibleProjects) || visibleProjects.length > 200) return false;
  for (const item of visibleProjects) {
    if (!item || typeof item !== 'object') return false;
    if ('finalVideoUrl' in item || 'finalFiles' in item) return false;
  }
  return true;
}

export function validateClientStatusUpdate(
  updatePayload: Record<string, unknown>,
  existingDescargaHabilitada = false
): boolean {
  if (existingDescargaHabilitada) return false;
  if (!updatePayload || typeof updatePayload !== 'object') return false;
  const keys = Object.keys(updatePayload);
  if (keys.length !== 1 || keys[0] !== 'status') return false;
  const status = updatePayload.status;
  return typeof status === 'string' && VALID_STATUSES.includes(status as ProjectStatus);
}

export function canClientReadEntrega(
  isAdmin: boolean,
  projectDescargaHabilitada: boolean
): boolean {
  return isAdmin || projectDescargaHabilitada === true;
}

const REQUIRED_COMMENT_KEYS = [
  'projectId',
  'authorName',
  'text',
  'videoSecond',
  'createdAt',
  'resolved',
];

const ALLOWED_COMMENT_KEYS = new Set([
  ...REQUIRED_COMMENT_KEYS,
  'imageNumber',
]);

export function validateCommentCreatePayload(
  data: Record<string, unknown>,
  parentProjectExists = true
): boolean {
  if (!parentProjectExists) return false;
  if (!data || typeof data !== 'object') return false;
  const keys = Object.keys(data);
  for (const reqKey of REQUIRED_COMMENT_KEYS) {
    if (!(reqKey in data)) return false;
  }
  for (const k of keys) {
    if (!ALLOWED_COMMENT_KEYS.has(k)) return false;
  }

  const { projectId, authorName, text, videoSecond, imageNumber, resolved } = data;
  if (!isValidId(projectId)) return false;
  if (typeof authorName !== 'string' || authorName.trim().length < 1 || authorName.length > 80) return false;
  if (typeof text !== 'string' || text.trim().length < 1 || text.length > 1000) return false;
  if (typeof videoSecond !== 'number' || !Number.isFinite(videoSecond) || videoSecond < 0 || videoSecond > 86400) return false;
  if (
    imageNumber !== undefined &&
    (typeof imageNumber !== 'number' ||
      !Number.isFinite(imageNumber) ||
      imageNumber < 1 ||
      imageNumber > 500)
  ) {
    return false;
  }
  if (resolved !== false) return false;

  return true;
}
