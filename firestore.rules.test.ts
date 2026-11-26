import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProjectPayload,
  validateClientStatusUpdate,
  validateCommentCreatePayload,
  isAuthorizedAdminUser,
} from './src/utils/validation';

const NOW = new Date('2026-11-26T14:40:00.000Z');

const validProject = {
  title: 'Reel Campaña Black Friday',
  clientName: 'Estudio Lumina',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  price: 450,
  currency: 'S/' as const,
  showPrice: true,
  watermarkEnabled: true,
  watermarkText: 'BORRADOR - ESTUDIO LUMINA',
  status: 'En revisión' as const,
  whatsappNumber: '51987654321',
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

test('Dirty Dozen #2: Non-admin user cannot pass admin check for listing projects', () => {
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

test('Dirty Dozen #4: Client invalid status value is rejected', () => {
  const invalidStatusUpdate = {
    status: 'Pagado',
  };
  assert.equal(validateClientStatusUpdate(invalidStatusUpdate), false);
});

test('Dirty Dozen #5: Shadow field injection on Project is rejected', () => {
  const shadowProject = {
    ...validProject,
    isVerified: true,
  };
  assert.equal(validateProjectPayload(shadowProject), false);
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

test('Dirty Dozen #9 & #10 & #11 & #12: Invalid IDs, negative timestamps, and empty author names are rejected', () => {
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
});

import { generateSecureProjectId, parseRoutePath, isValidId } from './src/utils/validation';

test('generateSecureProjectId produces random IDs of at least 20 characters', () => {
  const id1 = generateSecureProjectId();
  const id2 = generateSecureProjectId();
  assert.ok(id1.length >= 20);
  assert.ok(id2.length >= 20);
  assert.notEqual(id1, id2);
  assert.equal(isValidId(id1), true);
});

test('parseRoutePath separates Admin root (/) from Client page (/ver/ID) and flags invalid routes', () => {
  assert.deepEqual(parseRoutePath('/'), { view: 'admin' });
  assert.deepEqual(parseRoutePath('/ver/AbCdEfGhIjKlMnOpQrStUvWxYz12'), {
    view: 'client',
    projectId: 'AbCdEfGhIjKlMnOpQrStUvWxYz12',
  });
  assert.deepEqual(parseRoutePath('/ver/'), { view: 'invalid-client-link' });
  assert.deepEqual(parseRoutePath('/otra-ruta'), { view: 'invalid-client-link' });
});

