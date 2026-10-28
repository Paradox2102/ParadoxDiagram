// Live mode in the editor: a #live= link (or the target kept for this tab) connects the diagram to the AI's MCP
// server. Documents from the server replace the one shown, without undo steps; each local edit goes to the server as
// a patch. A diagram with work in it is only replaced after the user says so.
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { diffDocs, isEmptyPatch } from '../model/patch';
import type { Doc } from '../model/types';
import { needsConfirm } from '../share/share';
import type { DocHistory } from '../ui/useDocHistory';
import { connectLive, type LiveState } from './client';
import { loadTarget, readLiveHash, saveTarget, withoutLive, type LiveTarget } from './link';

/** Sends one local edit; useDocHistory's onLocal calls it. */
export type LiveSend = (before: Doc, after: Doc) => void;

/** Browser autosave runs when the tab is not live (or the live link has stopped). */
export const autosaveAllowed = (state: LiveState | null) => state === null || state === 'stopped';

const MESSAGE_MS = 6000;

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export interface LiveOptions {
  WS?: typeof WebSocket;
  storage?: Storage | null;
  /** Called when the AI's diagram arrives (the editor fits it to the view). */
  onWelcome?: () => void;
}

export function useLive(hist: DocHistory, sendRef: MutableRefObject<LiveSend | null>, opts: LiveOptions = {}) {
  const [state, setState] = useState<LiveState | null>(null);
  const [pending, setPending] = useState<LiveTarget | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const client = useRef<ReturnType<typeof connectLive> | null>(null);
  const histRef = useRef(hist);
  histRef.current = hist;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const storage = useRef(opts.storage === undefined ? sessionStore() : opts.storage).current;

  const connect = useCallback((t: LiveTarget) => {
    saveTarget(storage, t);
    setPending(null);
    setFatal(null);
    client.current?.close();
    client.current = connectLive(t, {
      onWelcome: (m) => {
        histRef.current.setLive(true);
        histRef.current.remote(m.doc);
        optsRef.current.onWelcome?.();
      },
      onDoc: (m) => histRef.current.remote(m.doc),
      onReject: (e) => setMessage(e),
      onState: (s) => {
        setState(s);
        if (s === 'stopped') {
          histRef.current.setLive(false);
          saveTarget(storage, null);
        }
      },
      onFatal: (m) => setFatal(m),
    }, __APP_VERSION__, optsRef.current.WS);
  }, [storage]);

  sendRef.current = (before, after) => {
    if (!client.current) return;
    const p = diffDocs(before, after);
    if (!isEmptyPatch(p)) client.current.send(p);
  };

  useEffect(() => {
    const check = () => {
      const fromHash = readLiveHash(window.location.hash);
      if (fromHash) {
        const { pathname, search, hash } = window.location;
        window.history.replaceState(null, '', pathname + search + withoutLive(hash));
      }
      const stored = loadTarget(storage);
      const t = fromHash ?? stored;
      if (!t) return;
      const reload = !fromHash || (stored?.port === fromHash.port && stored.token === fromHash.token);
      if (reload || !needsConfirm(histRef.current.doc)) connect(t);
      else setPending(t);
    };
    check();
    window.addEventListener('hashchange', check);
    return () => {
      window.removeEventListener('hashchange', check);
      client.current?.close();
      client.current = null;
    };
  }, [connect, storage]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(t);
  }, [message]);

  const leave = () => {
    client.current?.close();
    client.current = null;
    setState(null);
    histRef.current.setLive(false);
    saveTarget(storage, null);
  };

  return {
    state,
    pending,
    message,
    fatal,
    accept: () => pending && connect(pending),
    decline: () => {
      setPending(null);
      saveTarget(storage, null);
    },
    leave,
    dismissFatal: () => setFatal(null),
  };
}
