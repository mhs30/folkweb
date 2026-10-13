# Verifying a selector in the browser

Use the integrated browser's Playwright tool on the target page. These snippets only read the DOM.

## 1. Inspect the ancestor chain of a visible label

Replace `LABEL` with visible text inside the widget (e.g. "AI Overview", "Copilot", "Sponsored").

```js
return await page.evaluate(() => {
  const LABEL = /AI Overview/i;
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n && out.length < 3; n = walker.nextNode()) {
    if (!LABEL.test(n.textContent)) continue;
    const chain = [];
    for (let el = n.parentElement, i = 0; el && i < 10; el = el.parentElement, i++) {
      const attrs = ['id', 'data-testid', 'aria-label', 'jsname', 'role']
        .filter((a) => el.hasAttribute(a))
        .map((a) => `[${a}="${el.getAttribute(a)}"]`)
        .join('');
      chain.push(el.tagName.toLowerCase() + attrs);
    }
    out.push(chain);
  }
  return out;
});
```

## 2. Count matches for a candidate selector

Pass the CSS selector part of the rule (everything after `##`).

```js
return await page.evaluate((sel) => {
  const els = [...document.querySelectorAll(sel)];
  return {
    count: els.length,
    sizes: els.slice(0, 5).map((e) => ({ tag: e.tagName, textLength: (e.textContent || '').length })),
  };
}, '#b_copilot_search_container');
```

A good rule: `count` ≥ 1 on the target page, small `textLength` (the widget, not the whole page),
and `count === 0` on an unrelated page of the same site.
