import { browser } from 'wxt/browser';
import { isFromThisExtension, isOpenBlockedMessage } from '../lib/messages';
import { shouldOpenWelcome } from '../lib/onboarding';
import { parseSafeUrl } from '../lib/url-safety';

const C2PA_MENU_ID = 'folkweb-check-credentials';

export default defineBackground(() => {
  // Registered first: Firefox for Android has no contextMenus or windows API, and a throw
  // below must never stop blocked sites from reaching the stop page.
  browser.runtime.onMessage.addListener((msg, sender) => {
    if (!isFromThisExtension(sender, browser.runtime.id)) return undefined;
    if (isOpenBlockedMessage(msg)) {
      const tabId = sender.tab?.id;
      const target = parseSafeUrl(msg.url);
      if (tabId === undefined || sender.frameId !== 0 || !target) return undefined;
      const page = new URL(browser.runtime.getURL('/blocked.html'));
      page.searchParams.set('u', target.href);
      page.searchParams.set('m', msg.matched);
      return browser.tabs.update(tabId, { url: page.href }).then(() => true);
    }
    return undefined;
  });

  browser.runtime.onInstalled.addListener((details) => {
    if (shouldOpenWelcome(details)) void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
    if (!browser.contextMenus) return;
    void browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({
        id: C2PA_MENU_ID,
        title: 'Check Content Credentials (Folkweb)',
        contexts: ['image', 'video', 'audio'],
      });
    });
  });

  browser.contextMenus?.onClicked.addListener((info) => {
    if (info.menuItemId !== C2PA_MENU_ID) return;
    const src = parseSafeUrl(info.srcUrl);
    const page = new URL(browser.runtime.getURL('/credentials.html'));
    if (src) page.searchParams.set('src', src.href);
    else page.searchParams.set('error', 'unsupported');
    if (browser.windows) void browser.windows.create({ url: page.href, type: 'popup', width: 460, height: 640 });
    else void browser.tabs.create({ url: page.href });
  });
});
