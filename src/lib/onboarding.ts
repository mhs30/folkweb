/** Open the welcome page once, on a fresh install — never on updates or browser restarts. */
export function shouldOpenWelcome(details: { reason?: unknown }): boolean {
  return details.reason === 'install';
}
