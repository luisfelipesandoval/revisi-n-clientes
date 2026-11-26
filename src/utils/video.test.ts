import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractYouTubeId,
  parseVideoUrl,
  formatVideoTimestamp,
  parseTimestampInput,
  sortCommentsByTime,
  buildWhatsAppApprovalUrl,
  formatPrice,
} from './video';
import { VideoComment } from '../types';

test('extractYouTubeId handles unlisted watch URLs, Shorts, youtu.be, and embed links', () => {
  assert.equal(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?si=12345'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeId('https://www.youtube.com/shorts/9bZkp7q19f0'), '9bZkp7q19f0');
  assert.equal(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeId('https://cdn.example.com/reel-vertical.mp4'), null);
});

test('parseVideoUrl differentiates YouTube vs direct MP4 vs invalid URLs', () => {
  const yt = parseVideoUrl('https://www.youtube.com/shorts/9bZkp7q19f0');
  assert.equal(yt.type, 'youtube');
  if (yt.type === 'youtube') {
    assert.equal(yt.videoId, '9bZkp7q19f0');
  }

  const mp4 = parseVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4');
  assert.equal(mp4.type, 'mp4');

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
