import type { Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Loads the host (StageScreen) page and returns it plus its 4-char session code. Waits for the
 * realtime connection to actually succeed, not just for the session code to render — the code
 * itself is local state generated immediately on mount, independent of whether the Pusher/WS
 * connection has finished. A test that only waited for the code could send a phone action
 * (upload-notify, control, vote) before the host's channel subscription was actually live,
 * which Pusher has no replay for — a real flake, not a product bug, but worth avoiding here.
 */
export async function openHost(browser: Browser): Promise<{ page: Page; sessionCode: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  const codeLocator = page.locator('p', { hasText: 'Código:' }).locator('strong');
  await expect(codeLocator).toBeVisible({ timeout: 15_000 });
  const sessionCode = (await codeLocator.textContent())!.trim();

  await page.getByText('herramientas de desarrollo').click();
  await expect(page.getByText('WS: ✅', { exact: false })).toBeVisible({ timeout: 15_000 });

  return { page, sessionCode };
}

/** Loads the phone role-picker page already joined to the given session. */
export async function openPhone(browser: Browser, sessionCode: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/#/phone?s=${sessionCode}`);
  await expect(page.getByText('conectado', { exact: false })).toBeVisible({ timeout: 15_000 });
  return page;
}
