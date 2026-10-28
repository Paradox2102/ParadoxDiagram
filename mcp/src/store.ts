// The one copy of the diagram: the AI's tools and the live tabs change it here, in arrival order. Each change gets
// a revision number and is saved to the file at once (written to a .tmp file, then renamed).
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import type { Catalog } from '../../src/catalog/catalog';
import { docToJson } from '../../src/export/json';
import { applyPatch, diffDocs } from '../../src/model/patch';
import { emptyDoc, type Doc } from '../../src/model/types';
import { validateDoc } from '../../src/model/validate';

export interface ChangeEvent {
  rev: number;
  doc: Doc;
  by: 'ai' | 'tab';
  seq?: number;
  /** Another file: the tabs start over (fresh undo) instead of taking it as an edit. */
  reset?: boolean;
}

/** A path from the AI or the command line: ~/ is the home folder, a relative path is from the working folder. */
export function resolvePath(p: string): string {
  if (p === '~' || p.startsWith('~/')) return join(homedir(), p.slice(2));
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

const AI_UNDO_LIMIT = 50;

export class DiagramStore {
  doc: Doc = emptyDoc();
  rev = 0;
  file: string | null = null;
  private listeners = new Set<(e: ChangeEvent) => void>();
  private aiSteps: { before: Doc; after: Doc }[] = [];

  constructor(private catalog: Catalog) {}

  /** Make a new, empty diagram file; an existing file is never overwritten. Returns the absolute path. */
  create(path: string, title?: string): string {
    const file = resolvePath(path);
    if (existsSync(file)) throw new Error(`${file} already exists. Use open_diagram to open it.`);
    const doc = emptyDoc();
    if (title?.trim()) doc.title = title.trim();
    this.file = file;
    this.aiSteps = [];
    this.set(doc, 'ai', undefined, true, true);
    return file;
  }

  /** Open a diagram file. Wires that do not match their ports are left out and counted. */
  open(path: string): { file: string; droppedWires: number } {
    const file = resolvePath(path);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      throw new Error(`${file}: ${(e as Error).message}`);
    }
    const { doc, droppedWires } = validateDoc(raw, this.catalog);
    this.file = file;
    this.aiSteps = [];
    this.set(doc, 'ai', undefined, false, true);
    return { file, droppedWires };
  }

  /** The file, or the error an edit gives when no diagram is open. */
  requireFile(): string {
    if (!this.file) throw new Error('No diagram is open. Call new_diagram or open_diagram first.');
    return this.file;
  }

  /** Make `next` the diagram: a new revision, saved, and sent to the listeners. Returns the revision. */
  commit(next: Doc, by: 'ai' | 'tab', seq?: number): number {
    if (next === this.doc) return this.rev;
    this.set(next, by, seq);
    return this.rev;
  }

  onChange(fn: (e: ChangeEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Remember one AI edit, for undo_last_edit. */
  pushAiStep(before: Doc, after: Doc): void {
    if (before !== after) this.aiSteps = [...this.aiSteps, { before, after }].slice(-AI_UNDO_LIMIT);
  }

  /** Reverse the AI's last edit on the current diagram, leaving later edits from the tab. False when none is left. */
  undoAi(): boolean {
    const step = this.aiSteps.pop();
    if (!step) return false;
    const { doc, error } = applyPatch(this.doc, diffDocs(step.after, step.before));
    if (error) throw new Error(`The last edit cannot be undone: ${error}`);
    this.commit(doc, 'ai');
    return true;
  }

  private set(doc: Doc, by: 'ai' | 'tab', seq?: number, save = true, reset = false) {
    this.doc = doc;
    this.rev++;
    if (save && this.file) {
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, docToJson(doc));
      renameSync(tmp, this.file);
    }
    for (const fn of this.listeners) fn({ rev: this.rev, doc, by, ...(seq !== undefined ? { seq } : {}), ...(reset ? { reset } : {}) });
  }
}
