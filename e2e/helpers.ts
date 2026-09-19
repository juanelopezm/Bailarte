import type { Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Loads the host (StageScreen) page and returns it plus its 4-char session code. */
export async function openHost(browser: Browser): Promise<{ page: Page; sessionCode: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  const codeLocator = page.locator('p', { hasText: 'Código:' }).locator('strong');
  await expect(codeLocator).toBeVisible({ timeout: 15_000 });
  const sessionCode = (await codeLocator.textContent())!.trim();
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
