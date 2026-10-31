import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function shippedPageBody(): string {
  return pageBodyOf('index.html');
}

// Scripts are dropped so each test runs the page's code itself.
export function pageBodyOf(pagePath: string): string {
  const page = new DOMParser().parseFromString(readFileSync(join(process.cwd(), pagePath), 'utf8'), 'text/html');
  for (const script of page.body.querySelectorAll('script')) script.remove();
  return page.body.innerHTML;
}

// jsdom cannot parse container queries and has no layout to apply them, so they are left out.
export function shippedPageStyles(): string {
  const page = new DOMParser().parseFromString(readFileSync(join(process.cwd(), 'index.html'), 'utf8'), 'text/html');
  const css = [...page.head.querySelectorAll('style')].map(style => style.textContent ?? '').join('\n');
  const kept: string[] = [];
  let depth = 0;
  let blockStart = 0;
  for (let index = 0; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] !== '}') continue;
    depth -= 1;
    if (depth > 0) continue;
    const block = css.slice(blockStart, index + 1);
    if (!block.trim().startsWith('@container')) kept.push(block);
    blockStart = index + 1;
  }
  return `<style>${kept.join('')}</style>`;
}
