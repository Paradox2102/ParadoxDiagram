// Snapshot share links: the whole diagram, deflated and base64url-encoded, after #share= in
// the URL. The part after # never reaches a server, and the link always shows this version.
import type { Catalog } from '../catalog/catalog';
import type { Doc } from '../model/types';
import { validateDoc } from '../model/validate';
import type { LayerView } from '../ui/Header';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as Uint8Array<ArrayBuffer>).catch(() => {});
  void writer.close().catch(() => {});
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function encodeShare(doc: Doc): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(doc));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/** The diagram in a share code, not yet checked (pass it to validateDoc). */
export async function decodeShare(code: string): Promise<unknown> {
  try {
    const json = await pipe(fromBase64Url(code), new DecompressionStream('deflate-raw'));
    return JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw new Error('The share link is damaged or incomplete.');
  }
}

export function buildShareUrl(base: string, code: string, layer: LayerView): string {
  return `${base}#share=${code}${layer === 'all' ? '' : `&layer=${layer}`}`;
}

export function readShareHash(hash: string): string | null {
  return /(?:^#|&)share=([A-Za-z0-9_-]+)/.exec(hash)?.[1] ?? null;
}

/** The hash with the share code taken out (the layer stays). */
export function withoutShare(hash: string): string {
  const rest = hash.replace(/^#/, '').split('&').filter((p) => p && !p.startsWith('share='));
  return rest.length ? `#${rest.join('&')}` : '';
}

export type Incoming = { doc: Doc; droppedWires: number } | { error: string };

/** The shared diagram in the URL hash, checked against the icon catalog; null when there is none. */
export async function readIncoming(hash: string, catalog: Catalog | null): Promise<Incoming | null> {
  const code = readShareHash(hash);
  if (!code) return null;
  try {
    return validateDoc(await decodeShare(code), catalog);
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Opening a share replaces the diagram kept in this browser: ask first unless it is empty. */
export function needsConfirm(current: Doc): boolean {
  return current.devices.length > 0 || current.wires.length > 0;
}
