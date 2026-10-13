import baseCss from '../themes/base.css?raw';
import calmCss from '../themes/calm.css?raw';
import newsprintCss from '../themes/newsprint.css?raw';
import terminalCss from '../themes/terminal.css?raw';
import win98Css from '../themes/win98.css?raw';
import y2kCss from '../themes/y2k.css?raw';
import type { Settings, ThemeId } from '../lib/settings';
import { removeStyle, upsertStyle } from './dom';

const THEME_CSS: Record<Exclude<ThemeId, 'none'>, string> = {
  newsprint: newsprintCss,
  terminal: terminalCss,
  win98: win98Css,
  y2k: y2kCss,
};

export function applyLook(settings: Settings): void {
  const root = document.documentElement;
  upsertStyle('folkweb-calm', calmCss);

  const calm: string[] = [];
  if (settings.calm.noAnimations) calm.push('still');
  if (settings.calm.grayscale) calm.push('gray');
  if (calm.length) root.setAttribute('data-folkweb-calm', calm.join(' '));
  else root.removeAttribute('data-folkweb-calm');

  if (settings.theme === 'none') {
    root.removeAttribute('data-folkweb-theme');
    removeStyle('folkweb-theme');
  } else {
    root.setAttribute('data-folkweb-theme', settings.theme);
    upsertStyle('folkweb-theme', `${baseCss}\n${THEME_CSS[settings.theme]}`);
  }
}

export function clearLook(): void {
  const root = document.documentElement;
  root.removeAttribute('data-folkweb-theme');
  root.removeAttribute('data-folkweb-calm');
  removeStyle('folkweb-theme');
  removeStyle('folkweb-calm');
  removeStyle('folkweb-cosmetic');
  removeStyle('folkweb-search');
}

/**
 * No autoplay: pause media that starts playing without a recent user gesture.
 * Uses the browser's own user-activation signal, so a click on "play" works normally.
 */
export function installAutoplayGuard(isEnabled: () => boolean): void {
  document.addEventListener(
    'play',
    (ev) => {
      if (!isEnabled()) return;
      const media = ev.target;
      if (!(media instanceof HTMLMediaElement)) return;
      const active = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive;
      if (active === false) media.pause();
    },
    true,
  );
}
