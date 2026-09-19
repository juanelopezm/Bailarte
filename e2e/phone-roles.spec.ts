// Coverage for the phone-role features that were rebuilt on top of the Pusher/relay transport
// but never actually exercised end-to-end afterward — the join handshake had its own real
// deadlock bug (see join-flow.spec.ts), so these paths (WebRTC signaling, remote control,
// video-upload notification) are exactly the kind of "built but unverified" surface most likely
// to have a similar latent bug.
import { test, expect } from '@playwright/test';
import { openHost, openPhone } from './helpers.ts';

test('phone camera role: WebRTC signaling relayed through Pusher reaches "connected"', async ({ browser }) => {
  const { page: hostPage, sessionCode } = await openHost(browser);
  const phonePage = await openPhone(browser, sessionCode);

  await phonePage.getByText('Cámara — segundo ángulo').click();

  // This exercises the full offer/answer/ICE relay: phone -> /api/relay -> Pusher -> host ->
  // /api/relay -> Pusher -> phone. A break anywhere in that chain leaves this on "Conectando…"
  // forever, the same failure shape as the join-handshake bug.
  await expect(phonePage.getByText('Transmitiendo a la pantalla principal')).toBeVisible({ timeout: 20_000 });

  await hostPage.close();
  await phonePage.close();
});

test('phone remote role: a control message relayed through Pusher reaches the host', async ({ browser }) => {
  const { page: hostPage, sessionCode } = await openHost(browser);
  const phonePage = await openPhone(browser, sessionCode);

  await phonePage.getByText('Control remoto').click();
  await phonePage.getByRole('button', { name: /Sorpréndeme/ }).click();

  // "surprise" -> host runs an iTunes search and selects a song -> song title renders. Confirms
  // the 'control' WsMsg actually reaches the host through /api/relay, not just that the phone
  // believes it sent something.
  await expect(hostPage.locator('text=🎵').first()).toBeVisible({ timeout: 20_000 });

  await hostPage.close();
  await phonePage.close();
});

test('phone upload role: a file goes straight to Blob and the host is notified', async ({ browser }) => {
  const { page: hostPage, sessionCode } = await openHost(browser);
  const phonePage = await openPhone(browser, sessionCode);

  await phonePage.getByRole('button', { name: '📤 Subir un video' }).click();
  await phonePage.locator('input[type=file]').setInputFiles({
    name: 'test-clip.mp4',
    mimeType: 'video/mp4',
    // Just needs to be a file the Blob client-upload token flow will accept — this test is
    // about the upload+notify plumbing, not real video decoding downstream.
    buffer: Buffer.from('not a real video, just exercising the upload path'),
  });

  await expect(phonePage.getByText('¡Video enviado!', { exact: false })).toBeVisible({ timeout: 20_000 });

  // Confirms /api/upload-notify actually reached the host via Pusher and it started its
  // (client-side) offline processing pipeline — the real regression risk in the Blob rewrite.
  await expect(hostPage.getByText('Procesando video subido', { exact: false })).toBeVisible({ timeout: 15_000 });

  await hostPage.close();
  await phonePage.close();
});
