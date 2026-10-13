/**
 * Tiny DOM builder for extension pages. Children are text or nodes — strings
 * always become text nodes, so untrusted data can never become markup.
 * Event handler attributes are rejected; attach listeners with `on`.
 */

type Child = Node | string | number | null | undefined | false;
type Handlers = Record<string, (e: Event) => unknown>;
type Attrs = { on?: Handlers } & Record<string, string | boolean | undefined | Handlers>;

const SAFE_URL_ATTRS = new Set(['href', 'src', 'action']);

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'on' || v === undefined || v === false || typeof v === 'object') continue;
    if (/^on/i.test(k)) throw new Error('inline event handlers are not allowed');
    if (SAFE_URL_ATTRS.has(k) && typeof v === 'string' && !/^(https?:|chrome-extension:|moz-extension:|#|\/)/i.test(v)) {
      continue;
    }
    el.setAttribute(k, v === true ? '' : v);
  }
  if (attrs.on) for (const [ev, fn] of Object.entries(attrs.on)) el.addEventListener(ev, fn as EventListener);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function mount(root: Element, ...nodes: Node[]): void {
  root.replaceChildren(...nodes);
}

/** External link that never leaks the extension page as referrer or opener. */
export function extLink(href: string, text: string): HTMLAnchorElement {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
}
