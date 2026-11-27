import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProjectPayload,
  validateClientePayload,
  validateClientStatusUpdate,
  validateCommentCreatePayload,
  isAuthorizedAdminUser,
  generateSecureProjectId,
  parseRoutePath,
  isValidId,
  canClientReadEntrega,
  normalizeClientName,
  filterMatchingClients,
  findSimilarExistingClient,
  buildVisibleProjectsSummary,
} from './src/utils/validation';
import { Cliente, Project } from './src/types';

const NOW = new Date('2026-11-26T14:40:00.000Z');

const validProject = {
  title: 'Reel Campaña Black Friday',
  clientName: 'Estudio Lumina',
  clientId: 'cli_12345678901234567890',
  mostrarEnListaCliente: true,
  videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  price: 450,
  currency: 'S/' as const,
  showPrice: true,
  watermarkEnabled: true,
  watermarkText: 'BORRADOR - ESTUDIO LUMINA',
  status: 'En revisión' as const,
  whatsappNumber: '51987654321',
  descargaHabilitada: false,
  createdAt: NOW,
  updatedAt: NOW,
};

test('Dirty Dozen #1: Unverified Admin Email Spoof is rejected', () => {
  const spoofedAdmin = {
    uid: 'user-123',
    email: 'chat.gpt.sandoval@gmail.com',
    emailVerified: false,
  };
  assert.equal(isAuthorizedAdminUser(spoofedAdmin), false);
});

test('Dirty Dozen #2: Non-admin user cannot pass admin check for listing projects or clients', () => {
  const regularUser = {
    uid: 'user-456',
    email: 'cliente@empresa.com',
    emailVerified: true,
  };
  assert.equal(isAuthorizedAdminUser(regularUser), false);
  assert.equal(isAuthorizedAdminUser(null), false);
});

test('Dirty Dozen #3: Client price tampering during status update is rejected', () => {
  const tamperedUpdate = {
    status: 'Aprobado',
    price: 0,
  };
  assert.equal(validateClientStatusUpdate(tamperedUpdate), false);
});

test('Dirty Dozen #4: Client invalid status value is rejected, and status update is blocked once descargaHabilitada is true', () => {
  const invalidStatusUpdate = {
    status: 'Pagado',
  };
  assert.equal(validateClientStatusUpdate(invalidStatusUpdate), false);
  assert.equal(validateClientStatusUpdate({ status: 'Cambios solicitados' }, false), true);
  assert.equal(validateClientStatusUpdate({ status: 'Aprobado' }, false), true);
  assert.equal(validateClientStatusUpdate({ status: 'Cambios solicitados' }, true), false);
});

test('Dirty Dozen #5: Shadow field injection on Project or Cliente (including finalVideoUrl leak) is rejected', () => {
  const shadowProject = {
    ...validProject,
    finalVideoUrl: 'https://secret.mp4',
  };
  assert.equal(validateProjectPayload(shadowProject), false);
  assert.equal(validateProjectPayload(validProject), true);

  const validCliente = {
    name: 'Dreyzon',
    note: 'Cliente frecuente de reels',
    visibleProjects: [
      {
        id: 'proj_12345678901234567890',
        title: 'Reel 1',
        status: 'En revisión',
        showPrice: true,
        price: 200,
        currency: 'S/',
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  };
  assert.equal(validateClientePayload(validCliente), true);

  const leakedCliente = {
    ...validCliente,
    visibleProjects: [
      {
        ...validCliente.visibleProjects[0],
        finalVideoUrl: 'https://secret.mp4',
      },
    ],
  };
  assert.equal(validateClientePayload(leakedCliente), false);
});

test('Dirty Dozen #6: Resource poisoning oversized comment text (>1000 chars) is rejected', () => {
  const oversizedComment = {
    projectId: 'proj-1',
    authorName: 'Carlos',
    text: 'a'.repeat(1001),
    videoSecond: 19,
    resolved: false,
    createdAt: NOW,
  };
  assert.equal(validateCommentCreatePayload(oversizedComment, true), false);
});

test('Dirty Dozen #7: Orphaned comment write (parent project does not exist) is rejected', () => {
  const orphanedComment = {
    projectId: 'missing-proj',
    authorName: 'Carlos',
    text: 'Cambiar el corte en este segundo',
    videoSecond: 19,
    resolved: false,
    createdAt: NOW,
  };
  assert.equal(validateCommentCreatePayload(orphanedComment, false), false);
});

test('Dirty Dozen #8: Pre-resolved comment injection on create is rejected', () => {
  const preResolvedComment = {
    projectId: 'proj-1',
    authorName: 'Carlos',
    text: 'Ajustar color',
    videoSecond: 12,
    resolved: true,
    createdAt: NOW,
  };
  assert.equal(validateCommentCreatePayload(preResolvedComment, true), false);
});

test('Dirty Dozen #9 & #10 & #11 & #12: Invalid IDs, negative timestamps, and locked entregas read are rejected', () => {
  const badIdComment = {
    projectId: 'proj/invalid$id!',
    authorName: 'Carlos',
    text: 'Hola',
    videoSecond: 10,
    resolved: false,
    createdAt: NOW,
  };
  assert.equal(validateCommentCreatePayload(badIdComment, true), false);

  const negativeSecondComment = {
    projectId: 'proj-1',
    authorName: 'Carlos',
    text: 'Hola',
    videoSecond: -5,
    resolved: false,
    createdAt: NOW,
  };
  assert.equal(validateCommentCreatePayload(negativeSecondComment, true), false);

  // Client cannot read entregas/ID when descargaHabilitada is false
  assert.equal(canClientReadEntrega(false, false), false);
  // Client CAN read entregas/ID when descargaHabilitada is true
  assert.equal(canClientReadEntrega(false, true), true);
  // Admin can always read entregas/ID
  assert.equal(canClientReadEntrega(true, false), true);
});

test('generateSecureProjectId produces random IDs of at least 20 characters', () => {
  const id1 = generateSecureProjectId();
  const id2 = generateSecureProjectId();
  assert.ok(id1.length >= 20);
  assert.ok(id2.length >= 20);
  assert.notEqual(id1, id2);
  assert.equal(isValidId(id1), true);
});

test('parseRoutePath separates Admin root (/), Client project page (/ver/ID), and Client portal (/cliente/ID)', () => {
  assert.deepEqual(parseRoutePath('/'), { view: 'admin' });
  assert.deepEqual(parseRoutePath('/ver/AbCdEfGhIjKlMnOpQrStUvWxYz12'), {
    view: 'client',
    projectId: 'AbCdEfGhIjKlMnOpQrStUvWxYz12',
  });
  assert.deepEqual(parseRoutePath('/cliente/ClIeNtId12345678901234567890'), {
    view: 'client-portal',
    clientId: 'ClIeNtId12345678901234567890',
  });
  assert.deepEqual(parseRoutePath('/ver/'), { view: 'invalid-client-link' });
  assert.deepEqual(parseRoutePath('/cliente/'), { view: 'invalid-client-link' });
  assert.deepEqual(parseRoutePath('/otra-ruta'), { view: 'invalid-client-link' });
});

test('Client autocomplete and duplicate detection match ignoring case, accents, and 1-char typos', () => {
  const savedClients: Cliente[] = [
    {
      id: 'c_dreyzon_123456789012345',
      name: 'Dreyzon',
      note: '',
      visibleProjects: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'c_valeria_123456789012345',
      name: 'Valería Gómez',
      note: 'Agencia creativa',
      visibleProjects: [],
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];

  assert.equal(normalizeClientName('  Valería   Gómez '), 'valeria gomez');
  assert.equal(filterMatchingClients(savedClients, 'valeria').length, 1);
  assert.equal(filterMatchingClients(savedClients, 'DREYZ').length, 1);

  // Duplicate check: "dreyzon" matches "Dreyzon"
  assert.equal(findSimilarExistingClient(savedClients, 'dreyzon')?.id, 'c_dreyzon_123456789012345');
  // Duplicate check: "Dreyszon" (1 char difference) matches "Dreyzon"
  assert.equal(findSimilarExistingClient(savedClients, 'Dreyszon')?.id, 'c_dreyzon_123456789012345');
  // Non-duplicate
  assert.equal(findSimilarExistingClient(savedClients, 'Estudio Norte'), null);
});

test('buildVisibleProjectsSummary filters out hidden projects and strips hidden prices', () => {
  const cid = 'c_dreyzon_123456789012345';
  const projects: Project[] = [
    {
      id: 'p1',
      title: 'Reel Visible con Precio',
      clientName: 'Dreyzon',
      clientId: cid,
      mostrarEnListaCliente: true,
      videoUrl: 'https://example.com/1.mp4',
      price: 250,
      currency: 'S/',
      showPrice: true,
      watermarkEnabled: true,
      watermarkText: '',
      status: 'En revisión',
      whatsappNumber: '',
      descargaHabilitada: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'p2',
      title: 'Reel Visible sin Precio y Entregado',
      clientName: 'Dreyzon',
      clientId: cid,
      mostrarEnListaCliente: true,
      videoUrl: 'https://example.com/2.mp4',
      price: 500,
      currency: 'S/',
      showPrice: false,
      watermarkEnabled: true,
      watermarkText: '',
      status: 'Aprobado',
      whatsappNumber: '',
      descargaHabilitada: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'p3',
      title: 'Reel Oculto en Borrador',
      clientName: 'Dreyzon',
      clientId: cid,
      mostrarEnListaCliente: false,
      videoUrl: 'https://example.com/3.mp4',
      price: 300,
      currency: 'S/',
      showPrice: true,
      watermarkEnabled: true,
      watermarkText: '',
      status: 'En revisión',
      whatsappNumber: '',
      descargaHabilitada: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ];

  const summary = buildVisibleProjectsSummary(projects, cid);
  assert.equal(summary.length, 2);

  const s1 = summary.find((s) => s.id === 'p1');
  assert.ok(s1);
  assert.equal(s1.price, 250);
  assert.equal(s1.status, 'En revisión');

  const s2 = summary.find((s) => s.id === 'p2');
  assert.ok(s2);
  assert.equal(s2.price, undefined);
  assert.equal(s2.showPrice, false);
  assert.equal(s2.status, 'Entregado');
});
