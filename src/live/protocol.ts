// The live link between a browser tab and the MCP server on 127.0.0.1: JSON text frames, the same on both sides.
import type { DocPatch } from '../model/patch';
import type { Doc } from '../model/types';

export const LIVE_PROTOCOL = 1;
export const LIVE_PATH = '/live';
/** Close codes: wrong token, and a protocol version the other side does not speak. */
export const CLOSE_BAD_TOKEN = 4401;
export const CLOSE_PROTOCOL = 4426;

/** The only action a tab sends: its edit as a patch. */
export interface RestoreAction {
  type: 'restore';
  patch: DocPatch;
}

export type TabMessage =
  | { t: 'hello'; token: string; protocol: number; app: string }
  | { t: 'action'; seq: number; action: RestoreAction };

export type ServerMessage =
  | { t: 'welcome'; rev: number; doc: Doc; file: string | null; server: string }
  | { t: 'doc'; rev: number; doc: Doc; by: 'ai' | 'tab'; seq?: number }
  | { t: 'reject'; seq: number; error: string }
  | { t: 'error'; code: number; message: string };
