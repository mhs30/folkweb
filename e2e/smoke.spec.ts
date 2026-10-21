import { expect, test } from './fixtures';

/**
 * Smoke tests for the built extension. They run in order on one fresh browser profile,
 * like a person installing Folkweb, and end by checking that nothing logged an error.
 */
test.describe.configure({ mode: 'serial' });

test('the welcome page opens once, on install', async ({ folkweb }) => {
  const welcome =
    folkweb.context.pages().find((p) => p.url().endsWith('/welcome.html')) ??
    (await folkweb.context.waitForEvent('page', { predicate: (p) => p.url().endsWith('/welcome.html') }));
  await expect(welcome.getByRole('heading', { name: 'Welcome to Folkweb' })).toBeVisible();
  await expect(welcome.getByLabel('Hide AI panels and AI summaries I didn’t ask for')).toBeChecked();
  await welcome.close();
});

test('every extension page renders', async ({ folkweb }) => {
  const page = await folkweb.context.newPage();
  const base = `chrome-extension://${folkweb.id}`;

  await page.goto(`${base}/options.html`);
  await expect(page.getByRole('heading', { name: 'Share and back up' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'folkweb.org/support' })).toHaveAttribute('href', 'https://folkweb.org/support/');

  await page.goto(`${base}/blocked.html?u=${encodeURIComponent('https://slop.e2e.test/')}&m=slop.e2e.test`);
  await expect(page.getByText('Let’s take a different path')).toBeVisible();

  await page.goto(`${base}/credentials.html?error=unsupported`);
  await expect(page.locator('#app')).toContainText('can’t be checked');

  await page.goto(`${base}/popup.html`);
  await expect(page.getByRole('button', { name: /Wander/ })).toBeVisible();
  await page.close();
});

test('retro themes preserve sticky navigation, floating menus, lists, and images', async ({ folkweb }) => {
  const page = await folkweb.context.newPage();
  for (const theme of ['newsprint', 'y2k']) {
    await folkweb.setSettings({ theme });
    await page.goto('https://blog.e2e.test/theme');
    await expect(page.locator('html')).toHaveAttribute('data-folkweb-theme', theme);

    const layout = await page.evaluate(() => {
      const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
      return {
        header: [style('#sticky').position, style('#sticky').backgroundColor, style('#sticky').boxShadow],
        navLink: style('#sticky a').color,
        menu: [style('#menu').position, style('#menu').backgroundColor, style('#menu').boxShadow],
        aside: [style('#floating-list').float, style('#floating-list').backgroundColor],
        list: [style('#list').listStyleType, style('#list-item').backgroundColor],
        imageFilter: style('#avatar').filter,
        iconFont: style('#icon').fontFamily,
      };
    });
    expect(layout.header[0]).toBe('fixed');
    expect(layout.header[1]).toBe('rgb(38, 56, 74)');
    expect(layout.header[2]).not.toBe('none');
    expect(layout.navLink).toBe('rgb(255, 255, 255)');
    expect(layout.menu[0]).toBe('fixed');
    expect(layout.menu[1]).toBe('rgb(231, 237, 242)');
    expect(layout.menu[2]).not.toBe('none');
    expect(layout.aside).toEqual(['right', 'rgb(238, 242, 246)']);
    expect(layout.list).toEqual(['square', 'rgb(240, 240, 240)']);
    expect(layout.imageFilter).toBe('none');
    expect(layout.iconFont).toBe('monospace');

    await page.locator('html').evaluate((html) => html.setAttribute('data-color-mode', 'dark'));
    await expect.poll(() => page.locator('body').evaluate((body) => getComputedStyle(body).colorScheme)).toBe('dark');
    const dark = await page.evaluate(() => ({
      menu: getComputedStyle(document.querySelector('#menu')!).backgroundColor,
      list: getComputedStyle(document.querySelector('#list-item')!).backgroundColor,
      ink: getComputedStyle(document.body).color,
    }));
    expect(dark.menu).toBe('rgb(28, 49, 80)');
    expect(dark.list).toBe('rgb(28, 49, 80)');
    expect(dark.ink).toBe(theme === 'newsprint' ? 'rgb(245, 240, 230)' : 'rgb(241, 246, 255)');

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.locator('html').evaluate((html) => html.setAttribute('data-color-mode', 'auto'));
    await expect.poll(() => page.locator('body').evaluate((body) => getComputedStyle(body).colorScheme)).toBe('dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => page.locator('body').evaluate((body) => getComputedStyle(body).colorScheme)).toBe('light');
  }
  await page.close();
});

test('a page: hides clutter, shows human signals, explains and reveals', async ({ folkweb }) => {
  await folkweb.setSettings({ customFilters: 'blog.e2e.test##.newsletter-box' });
  const tab = await folkweb.context.newPage();
  await tab.goto('https://blog.e2e.test/');

  await expect(tab.locator('.newsletter-box')).toBeHidden();
  await expect(tab.locator('article.promo')).toBeHidden();
  await expect(tab.locator('article.post')).toBeVisible();

  const popup = await folkweb.popupFor(tab);
  await expect(popup.locator('.fw-signals')).toContainText('Declares human authorship');
  await expect(popup.locator('.fw-signals')).toContainText('Has a feed');
  await expect(popup.locator('.fw-signals')).toContainText('Publishes an /ai policy');
  await expect(popup.getByRole('heading', { name: /Hidden on this page \(2\)/ })).toBeVisible();
  await expect(popup.locator('summary', { hasText: 'Your own filters' })).toBeVisible();
  await expect(popup.locator('summary', { hasText: 'Posts labelled as ads' })).toBeVisible();

  await popup.getByRole('button', { name: 'Show them on the page' }).click();
  await expect(tab.locator('.newsletter-box')).toBeVisible();
  await expect(tab.locator('article.promo')).toBeVisible();
  await popup.close();
  await tab.close();
});

test('search: AI panel and blocked results hidden, trusted results badged, "only trusted" can be undone', async ({ folkweb }) => {
  await folkweb.setSettings({ theme: 'y2k', userBlock: ['slop.e2e.test'], search: { trustedMode: 'only' } });
  const tab = await folkweb.context.newPage();
  await tab.goto('https://www.bing.com/search?q=css+grid');

  await expect(tab.locator('html')).toHaveAttribute('data-folkweb-theme', 'y2k');
  expect(await tab.locator('#b_results').evaluate((list) => getComputedStyle(list).listStyleType)).toBe('decimal');
  expect(await tab.locator('#r-indieweb').evaluate((result) => getComputedStyle(result).backgroundColor)).toBe('rgb(240, 240, 240)');
  await expect(tab.locator('#b_copilot_search_container')).toBeHidden();
  await expect(tab.locator('#r-slop')).toBeHidden();
  await expect(tab.locator('#r-indieweb [data-folkweb-badge]')).toHaveText('★ folk');
  await expect(tab.locator('#r-other')).toBeHidden();

  const notice = tab.locator('[data-folkweb-notice]');
  await expect(notice).toContainText('Showing only sources you trust. 1 other result hidden.');
  await notice.getByRole('button', { name: 'Show all here' }).click();
  await expect(tab.locator('#r-other')).toBeVisible();
  await expect(tab.locator('#r-other')).toHaveAttribute('data-folkweb-faded', '');
  await tab.close();
});

test('a blocked site gets the calm stop page, and you can continue', async ({ folkweb }) => {
  await folkweb.setSettings({ userBlock: ['slop.e2e.test'] });
  const tab = await folkweb.context.newPage();
  await tab.goto('https://slop.e2e.test/').catch(() => {});
  await expect(tab).toHaveURL(/\/blocked\.html/);
  await expect(tab.getByText('slop.e2e.test')).toBeVisible();
  await tab.getByRole('button', { name: /Continue/ }).click();
  await expect(tab).toHaveURL('https://slop.e2e.test/');
  await expect(tab.getByRole('heading', { name: 'Plain page' })).toBeVisible();
  await tab.close();
});

test('settings: export and re-import lists', async ({ folkweb }) => {
  await folkweb.setSettings({ userBoost: ['jvns.ca'] });
  const page = await folkweb.context.newPage();
  await page.goto(`chrome-extension://${folkweb.id}/options.html`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export my lists' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^folkweb-lists-\d{4}-\d{2}-\d{2}\.json$/);

  await page.locator('input[type=file]').setInputFiles({
    name: 'friend.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'folkweb-lists', version: 1, boost: ['ooh.directory'], filters: 'evil.example##+js(alert)' })),
  });
  await expect(page.getByText('would add')).toBeVisible();
  await page.getByRole('button', { name: 'Add to my lists' }).click();
  await expect.poll(async () => (await folkweb.storedSettings()).userBoost).toEqual(['jvns.ca', 'ooh.directory']);
  expect((await folkweb.storedSettings()).customFilters).toBe('');
  await page.close();
});

test('nothing logged an error', async ({ folkweb }) => {
  expect(folkweb.errors).toEqual([]);
  expect(await folkweb.chromeErrors()).toBe('');
});
