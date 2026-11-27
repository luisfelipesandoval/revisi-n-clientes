export type ProjectStatus = 'En revisión' | 'Cambios solicitados' | 'Aprobado';

export type CurrencyCode = 'S/' | '$';

export interface Project {
  id: string;
  title: string;
  clientName: string;
  videoUrl: string;
  price: number;
  currency: CurrencyCode;
  showPrice: boolean;
  watermarkEnabled: boolean;
  watermarkText: string;
  status: ProjectStatus;
  whatsappNumber: string;
  descargaHabilitada: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectEntrega {
  projectId: string;
  finalVideoUrl: string;
  updatedAt: Date;
}

export interface VideoComment {
  id: string;
  projectId: string;
  authorName: string;
  text: string;
  videoSecond: number;
  createdAt: Date;
  resolved: boolean;
}

export interface ProjectFormInput {
  title: string;
  clientName: string;
  videoUrl: string;
  finalVideoUrl: string;
  descargaHabilitada: boolean;
  price: number;
  currency: CurrencyCode;
  showPrice: boolean;
  watermarkEnabled: boolean;
  watermarkText: string;
  status: ProjectStatus;
  whatsappNumber: string;
}
