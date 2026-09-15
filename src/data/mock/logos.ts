import { initialsOf } from '@/lib/initials';

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Згенерований логотип-бейдж (ініціали на кольоровому тлі) як data URL SVG. */
export function makeLogoDataUrl(name: string, color: string): string {
  const text = escapeXml(initialsOf(name));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="14" fill="${color}"/>` +
    `<text x="32" y="41" text-anchor="middle" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="24" font-weight="700" fill="#fff">${text}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
