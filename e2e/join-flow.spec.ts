// Regression test for the exact bug class that shipped broken once already: RealtimeClient's
// connect()/join() ordering deadlocked, so a phone scanning the QR got stuck on "conectando…"
// forever. A unit test can't catch this — it's specifically an integration bug between two
// browser tabs talking through the real hosted transport (Pusher + /api/relay). This drives two
// real browser contexts against the actual deployment, exactly like a host laptop + a guest phone.
import { test, expect } from '@playwright/test';
import { openHost, openPhone } from './helpers.ts';

test('a phone joining via the QR-encoded URL reaches "conectado", not stuck on "conectando"', async ({ browser }) => {
  const { page: hostPage, sessionCode } = await openHost(browser);

  // This is the actual regression check: before the fix, openPhone's wait for "conectado" would
  // time out forever, because RealtimeClient.connect() never opened a Pusher socket without a
  // join first, and join was only ever sent after a connection succeeded — a permanent deadlock.
  const phonePage = await openPhone(browser, sessionCode);
  await expect(phonePage.getByText('Cámara — segundo ángulo')).toBeVisible();
  await expect(phonePage.getByText('Control remoto')).toBeVisible();

  // The host should see the phone's presence too (peer count moves off 0).
  await expect(hostPage.getByText('1 teléfono conectado')).toBeVisible({ timeout: 15_000 });

  await hostPage.close();
  await phonePage.close();
});

test('the host page renders the core dance UI without crashing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Danza' })).toBeVisible();
  await expect(page.getByText('Baila. Exprésate.', { exact: false })).toBeVisible();
  // A React error boundary or thrown render error would leave this never appearing.
  await expect(page.getByText('Empezar a bailar', { exact: false })).toBeVisible({ timeout: 15_000 });
});

test('the hall of fame route renders without crashing', async ({ page }) => {
  await page.goto('/#/halloffame');
  await expect(page.getByText('Salón de la Fama')).toBeVisible();
});
