import type { Doc } from '../model/types';

export function docToJson(doc: Doc): string {
  return JSON.stringify(doc, null, 2) + '\n';
}

/** A file name from the title: characters outside [A-Za-z0-9 _-] become "-". */
export function fileBase(title: string): string {
  const t = title.trim();
  return t ? t.replace(/[^A-Za-z0-9 _-]/g, '-') : 'diagram';
}
