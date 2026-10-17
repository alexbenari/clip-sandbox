import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The shipped page's body markup without its scripts, so tests build controls from the real page. */
export function shippedPageBody(): string {
  const page = new DOMParser().parseFromString(readFileSync(join(process.cwd(), 'index.html'), 'utf8'), 'text/html');
  for (const script of page.body.querySelectorAll('script')) script.remove();
  return page.body.innerHTML;
}
