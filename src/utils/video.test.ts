import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVideoUrl,
  formatVideoTimestamp,
  parseTimestampInput,
  sortCommentsByTime,
  buildWhatsAppApprovalUrl,
  buildYapeWhatsAppUrl,
  formatFinalVideoFilename,
  getAdminDeliveryBadge,
  getStatusConfirmationConfig,
  formatPrice,
  YAPE_NUMBER_DISPLAY,
  YAPE_NUMBER_RAW,
} from './video';
import { VideoComment } from '../types';

test('parseVideoUrl accepts direct MP4 URLs and rejects YouTube or invalid URLs', () => {
  const mp4 = parseVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');
  assert.equal(mp4.type, 'mp4');
  if (mp4.type === 'mp4') {
    assert.equal(mp4.src, 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');
  }

  const yt = parseVideoUrl('https://www.youtube.com/shorts/9bZkp7q19f0');
  assert.equal(yt.type, 'invalid');

  const invalid = parseVideoUrl('not a url');
  assert.equal(invalid.type, 'invalid');
});

test('formatVideoTimestamp and parseTimestampInput format exact seconds accurately', () => {
  assert.equal(formatVideoTimestamp(0), '00:00');
  assert.equal(formatVideoTimestamp(19.7), '00:19');
  assert.equal(formatVideoTimestamp(75), '01:15');
  assert.equal(formatVideoTimestamp(3661), '01:01:01');

  assert.equal(parseTimestampInput('00:19'), 19);
  assert.equal(parseTimestampInput('01:15'), 75);
  assert.equal(parseTimestampInput('19'), 19);
  assert.equal(parseTimestampInput('01:75'), null);
});

test('sortCommentsByTime orders comments chronologically by videoSecond', () => {
  const d1 = new Date('2026-11-26T10:00:00Z');
  const d2 = new Date('2026-11-26T10:05:00Z');
  const comments: VideoComment[] = [
    { id: 'c1', projectId: 'p1', authorName: 'Ana', text: 'Final', videoSecond: 25, createdAt: d1, resolved: false },
    { id: 'c2', projectId: 'p1', authorName: 'Ana', text: 'Inicio', videoSecond: 3, createdAt: d2, resolved: true },
    { id: 'c3', projectId: 'p1', authorName: 'Ana', text: 'Medio', videoSecond: 14, createdAt: d1, resolved: false },
  ];

  const sorted = sortCommentsByTime(comments);
  assert.deepEqual(sorted.map((c) => c.id), ['c2', 'c3', 'c1']);
});

test('buildWhatsAppApprovalUrl and formatPrice generate expected Spanish output', () => {
  assert.equal(formatPrice(350, 'S/'), 'S/ 350');
  assert.equal(formatPrice(120.5, '$'), '$ 120.50');

  const waUrl = buildWhatsAppApprovalUrl({
    whatsappNumber: '+51 999 888 777',
    projectTitle: 'Reel Lanzamiento',
    clientName: 'María',
    price: 350,
    currency: 'S/',
    showPrice: true,
  });
  assert.ok(waUrl.startsWith('https://wa.me/51999888777?text='));
  assert.ok(decodeURIComponent(waUrl).includes('Reel Lanzamiento'));
  assert.ok(decodeURIComponent(waUrl).includes('S/ 350.00'));
});

test('Yape payment helpers, final video filename, and delivery badges work as specified', () => {
  assert.equal(YAPE_NUMBER_DISPLAY, '915 978 491');
  assert.equal(YAPE_NUMBER_RAW, '915978491');

  const yapeWa = buildYapeWhatsAppUrl('Reel Campaña Verano');
  assert.ok(yapeWa.startsWith('https://wa.me/51915978491?text='));
  assert.ok(decodeURIComponent(yapeWa).includes('Reel Campaña Verano'));

  assert.equal(formatFinalVideoFilename('Reel Campaña Verano'), 'Reel Campaña Verano.mp4');
  assert.equal(formatFinalVideoFilename('Video.mp4'), 'Video.mp4');

  assert.equal(getAdminDeliveryBadge('En revisión', false), null);
  assert.equal(getAdminDeliveryBadge('Aprobado', false)?.label, 'Pago pendiente');
  assert.equal(getAdminDeliveryBadge('Aprobado', true)?.label, 'Entregado');
});

test('getStatusConfirmationConfig returns exact Spanish prompts and target statuses', () => {
  const approveCfg = getStatusConfirmationConfig('approve');
  assert.equal(approveCfg.message, '¿Aprobar este video? Al aprobar se mostrará el método de pago.');
  assert.equal(approveCfg.confirmLabel, 'Sí, aprobar');
  assert.equal(approveCfg.cancelLabel, 'Cancelar');
  assert.equal(approveCfg.targetStatus, 'Aprobado');
  assert.equal(approveCfg.opensYapeModal, true);

  const removeCfg = getStatusConfirmationConfig('remove-approval');
  assert.equal(
    removeCfg.message,
    "¿Seguro que quieres quitar la aprobación? El proyecto volverá a 'En revisión'."
  );
  assert.equal(removeCfg.confirmLabel, 'Sí, quitar');
  assert.equal(removeCfg.cancelLabel, 'Cancelar');
  assert.equal(removeCfg.targetStatus, 'En revisión');
  assert.equal(removeCfg.opensYapeModal, false);

  const changesCfg = getStatusConfirmationConfig('request-changes');
  assert.equal(changesCfg.message, '¿Solicitar cambios en este video?');
  assert.equal(changesCfg.confirmLabel, 'Sí');
  assert.equal(changesCfg.cancelLabel, 'Cancelar');
  assert.equal(changesCfg.targetStatus, 'Cambios solicitados');
  assert.equal(changesCfg.opensYapeModal, false);
});
