import { browser } from 'wxt/browser';
import { isFromThisExtension, isOpenBlockedMessage } from '../lib/messages';
import { shouldOpenWelcome } from '../lib/onboarding';
import { parseSafeUrl } from '../lib/url-safety';

const C2PA_MENU_ID = 'folkweb-check-credentials';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    if (shouldOpenWelcome(details)) void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
    browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({
        id: C2PA_MENU_ID,
        title: 'Check Content Credentials (Folkweb)',
        contexts: ['image', 'video', 'audio'],
      });
    });
  });

  browser.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== C2PA_MENU_ID) return;
    const src = parseSafeUrl(info.srcUrl);
    const page = new URL(browser.runtime.getURL('/credentials.html'));
    if (src) page.searchParams.set('src', src.href);
    else page.searchParams.set('error', 'unsupported');
    void browser.windows.create({ url: page.href, type: 'popup', width: 460, height: 640 });
  });

  browser.runtime.onMessage.addListener((msg, sender) => {
    if (!isFromThisExtension(sender, browser.runtime.id)) return undefined;
    if (isOpenBlockedMessage(msg)) {
      const tabId = sender.tab?.id;
      const target = parseSafeUrl(msg.url);
      if (tabId === undefined || sender.frameId !== 0 || !target) return undefined;
      const page = new URL(browser.runtime.getURL('/blocked.html'));
      page.searchParams.set('u', target.href);
      page.searchParams.set('m', msg.matched);
      void browser.tabs.update(tabId, { url: page.href });
    }
    return undefined;
  });
});
