import { Project, VideoComment } from '../types';

export const DEMO_PROJECT_ID = 'demo-reel-vertical';

const INITIAL_DEMO_PROJECTS: Project[] = [
  {
    id: DEMO_PROJECT_ID,
    title: 'Reel Lanzamiento Colección Nocturna (9:16)',
    clientName: 'Valeria Mendoza · Studio Kora',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    price: 480,
    currency: 'S/',
    showPrice: true,
    watermarkEnabled: true,
    watermarkText: 'VISTA PREVIA · STUDIO KORA',
    status: 'En revisión',
    whatsappNumber: '51987654321',
    createdAt: new Date('2026-11-25T15:00:00Z'),
    updatedAt: new Date('2026-11-26T10:00:00Z'),
    isDemo: true,
  },
  {
    id: 'demo-spot-youtube',
    title: 'Short Campaña Gastronómica Lima',
    clientName: 'Restaurante Mar & Brasa',
    videoUrl: 'https://www.youtube.com/watch?v=M7lc1UVf-VE',
    price: 160,
    currency: '$',
    showPrice: true,
    watermarkEnabled: false,
    watermarkText: 'BORRADOR MAR & BRASA',
    status: 'Cambios solicitados',
    whatsappNumber: '51987654321',
    createdAt: new Date('2026-11-24T12:00:00Z'),
    updatedAt: new Date('2026-11-25T18:30:00Z'),
    isDemo: true,
  },
];

const INITIAL_DEMO_COMMENTS: VideoComment[] = [
  {
    id: 'demo-c1',
    projectId: DEMO_PROJECT_ID,
    authorName: 'Valeria Mendoza',
    text: 'Me encanta la entrada con el logo, pero ¿podemos subir un poco el brillo en este plano inicial?',
    videoSecond: 2,
    createdAt: new Date('2026-11-26T10:15:00Z'),
    resolved: true,
  },
  {
    id: 'demo-c2',
    projectId: DEMO_PROJECT_ID,
    authorName: 'Valeria Mendoza',
    text: 'En este corte exacto me gustaría agregar el subtítulo con el descuento del 20% en tipografía blanca.',
    videoSecond: 7,
    createdAt: new Date('2026-11-26T10:18:00Z'),
    resolved: false,
  },
  {
    id: 'demo-c3',
    projectId: DEMO_PROJECT_ID,
    authorName: 'Valeria Mendoza',
    text: 'Aquí al cierre asegurémonos de que el llamado a la acción dure al menos 3 segundos completos.',
    videoSecond: 12,
    createdAt: new Date('2026-11-26T10:21:00Z'),
    resolved: false,
  },
  {
    id: 'demo-c4',
    projectId: 'demo-spot-youtube',
    authorName: 'Diego Salas',
    text: 'Ajustar el volumen de la música de fondo cuando entra la locución en este segundo.',
    videoSecond: 5,
    createdAt: new Date('2026-11-25T16:10:00Z'),
    resolved: false,
  },
];

const PROJECTS_STORAGE_KEY = 'clipreview_demo_projects_v1';
const COMMENTS_STORAGE_KEY = 'clipreview_demo_comments_v1';

export function loadDemoProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return INITIAL_DEMO_PROJECTS;
    const parsed = JSON.parse(raw) as Array<Omit<Project, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string }>;
    return parsed.map((p) => ({
      ...p,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    }));
  } catch {
    return INITIAL_DEMO_PROJECTS;
  }
}

export function saveDemoProjects(projects: Project[]): void {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadDemoComments(): VideoComment[] {
  try {
    const raw = localStorage.getItem(COMMENTS_STORAGE_KEY);
    if (!raw) return INITIAL_DEMO_COMMENTS;
    const parsed = JSON.parse(raw) as Array<Omit<VideoComment, 'createdAt'> & { createdAt: string }>;
    return parsed.map((c) => ({
      ...c,
      createdAt: new Date(c.createdAt),
    }));
  } catch {
    return INITIAL_DEMO_COMMENTS;
  }
}

export function saveDemoComments(comments: VideoComment[]): void {
  try {
    localStorage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify(comments));
  } catch {
    // Ignore storage quota errors
  }
}
