// The /api page: how to let an AI agent build a diagram with you (the MCP server), and the reference of its tools,
// read from api/tools.json, which the build writes from the server's own tool definitions.
import { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { ThemeButton } from './ThemeButton';

export const CLAUDE_CODE = 'claude mcp add paradox-diagram -- npx -y @paradox2102/diagram-mcp';
export const MCP_JSON = JSON.stringify(
  { mcpServers: { 'paradox-diagram': { command: 'npx', args: ['-y', '@paradox2102/diagram-mcp'] } } },
  null,
  2,
);
const FIRST_PROMPT = `Use Paradox Diagram to draw the wiring of our robot. Make a new diagram called robot.paradox.json and open it in my browser.

Our robot has a SystemCore, a VH-109 radio (10.21.2.1), a REV PDH (CAN 1) with a 120 A main breaker and the battery,
two SPARK Flex on CAN bus S0 (intake CAN 21 on PDH channel 12 with a 40 A breaker, indexer CAN 22 on channel 16),
and two Kraken X60 on bus S1 (shooter left CAN 11 on channel 6, shooter right CAN 12 on channel 2).

Lay it out, render it, fix any problems, then tell me what you assumed.`;

interface JsonSchema {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
}

interface Reference {
  tools: { name: string; title: string; description: string; input: JsonSchema; example: unknown }[];
  ops: { op: string; description: string; input: JsonSchema; example: unknown }[];
}

/** A short type for the parameter table: string, number | null, "left" | "right", object[]. */
function typeOf(s: JsonSchema): string {
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (s.anyOf) return s.anyOf.map(typeOf).join(' | ');
  // the edit tool's list: one of the operations below
  if (s.oneOf) return s.oneOf.every((o) => o.properties?.op) ? 'operation' : s.oneOf.map(typeOf).join(' | ');
  if (s.type === 'array') return `${s.items ? typeOf(s.items) : 'any'}[]`;
  if (Array.isArray(s.type)) return s.type.join(' | ');
  return s.type ?? 'any';
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-block">
      <pre><code>{text}</code></pre>
      <button
        type="button" aria-label={`Copy the ${label}`}
        onClick={() =>
          navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }, () => {})}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Params({ schema, skip = [] }: { schema: JsonSchema; skip?: string[] }) {
  const props = Object.entries(schema.properties ?? {}).filter(([k]) => !skip.includes(k));
  if (!props.length) return <p className="api-none">No parameters.</p>;
  const required = new Set(schema.required ?? []);
  return (
    <table className="api-params">
      <thead>
        <tr><th>Parameter</th><th>Type</th><th>Description</th></tr>
      </thead>
      <tbody>
        {props.map(([name, p]) => (
          <tr key={name}>
            <td><code>{name}</code>{required.has(name) && <span className="api-required">required</span>}</td>
            <td><code>{typeOf(p)}</code></td>
            <td>{p.description ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Entry(p: { name: string; title?: string; description: string; input: JsonSchema; example: unknown; skip?: string[] }) {
  return (
    <article className="api-entry" id={`ref-${p.name}`} aria-labelledby={`ref-${p.name}-h`}>
      <h3 id={`ref-${p.name}-h`}><code>{p.name}</code></h3>
      {p.title && <p className="api-title">{p.title}</p>}
      <p>{p.description}</p>
      <Params schema={p.input} skip={p.skip} />
      <p className="api-example-label">Example</p>
      <pre className="api-example"><code>{JSON.stringify(p.example, null, 2)}</code></pre>
    </article>
  );
}

export function ApiPage() {
  const [ref, setRef] = useState<Reference | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    document.title = 'AI API · Paradox Diagram';
    fetch('api/tools.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setRef, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="gallery-page api-page">
      <header className="bar">
        <a className="brand" href="./" title="Open the diagram editor">
          <Logo />
          <span className="brand-name">Paradox Diagram</span>
        </a>
        <nav className="page-nav" aria-label="Pages">
          <a href="./">Diagram</a>
          <a href="gallery">Icons</a>
          <a href="api" aria-current="page">API</a>
          <ThemeButton className="theme-button page-theme" />
        </nav>
      </header>
      <main className="gallery api">
        <section className="gallery-intro">
          <h1>Build your diagram with an AI</h1>
          <p>
            Paradox Diagram has an MCP server: a small program that lets an AI agent (Claude, Cursor, or any app that
            speaks the Model Context Protocol) choose the devices, connect them, lay them out and fill in the details. You
            watch and edit the same diagram here, live, at the same time. Your edits reach the AI, and its edits reach
            you, with no import or export.
          </p>
        </section>

        <nav aria-label="On this page">
          <ul className="gallery-contents">
            <li><a href="#setup">Setup</a></li>
            <li><a href="#first">A first session</a></li>
            <li><a href="#how">How it works</a></li>
            <li><a href="#tools">Tools</a></li>
            <li><a href="#ops">Edit operations</a></li>
            <li><a href="#format">File format</a></li>
            <li><a href="#safety">The live link</a></li>
            <li><a href="#trouble">Troubleshooting</a></li>
          </ul>
        </nav>

        <section id="setup" className="api-section">
          <h2>Setup</h2>
          <p>
            You need <a href="https://nodejs.org">Node.js</a> 24 or later. The AI app starts the server for you with
            <code> npx</code>; there is nothing else to install.
          </p>
          <h3>Claude Code</h3>
          <CopyBlock label="Claude Code command" text={CLAUDE_CODE} />
          <h3>Claude Desktop, Cursor and other MCP apps</h3>
          <p>
            Add this to the app's MCP config. In Claude Desktop: Settings → Developer → Edit Config
            (<code>claude_desktop_config.json</code>), then restart Claude. In Cursor: <code>~/.cursor/mcp.json</code>.
          </p>
          <CopyBlock label="MCP config" text={MCP_JSON} />
          <p>
            To open one file each time, add <code>"--file", "~/robot/robot.paradox.json"</code> to <code>args</code>.
          </p>
        </section>

        <section id="first" className="api-section">
          <h2>A first session</h2>
          <p>
            Tell the AI what is on your robot. The more you give it (CAN IDs, PDH channels, breaker sizes, IP addresses),
            the less it has to ask. The server also has a <code>build_robot_diagram</code> prompt that asks you for each
            part in turn.
          </p>
          <CopyBlock label="example prompt" text={FIRST_PROMPT} />
        </section>

        <section id="how" className="api-section">
          <h2>How it works</h2>
          <ul>
            <li>The server keeps the diagram in a <code>.paradox.json</code> file and saves it after each change.</li>
            <li>
              <code>open_in_browser</code> opens this site with a live link. A “Live · AI connected” badge shows in the top
              bar while the tab is connected.
            </li>
            <li>
              The AI's changes show at once. Your drags and edits go back to the server, and the AI reads them with
              <code> get_diagram</code>. A change you are dragging is not interrupted: the AI's change shows when you let go.
            </li>
            <li>Undo in the tab undoes only your own edits. The AI has <code>undo_last_edit</code> for its own.</li>
            <li>
              The AI can look at its work with <code>render</code>, which gives it a picture of the diagram and a list of
              problems (overlaps, CAN IDs used twice, devices with no power).
            </li>
            <li>When the server stops, the tab keeps the last diagram as a normal diagram in your browser.</li>
          </ul>
        </section>

        <section id="tools" className="api-section">
          <h2>Tools</h2>
          {error && <p role="alert" className="gallery-error">The tool reference did not load: {error}</p>}
          {!ref && !error && <p className="gallery-status">Loading the tool reference…</p>}
          {ref?.tools.map((t) => <Entry key={t.name} name={t.name} title={t.title} description={t.description} input={t.input} example={t.example} />)}
        </section>

        <section id="ops" className="api-section">
          <h2>Edit operations</h2>
          <p>
            The <code>edit</code> tool takes a list of operations and runs them in order. If one fails, nothing changes,
            and the error names the operation and what is allowed. A port is written <code>device-id.port</code>, for
            example <code>pdh.ch4</code>; <code>search_devices</code> lists each device type's ports.
          </p>
          {ref?.ops.map((o) => <Entry key={o.op} name={o.op} description={o.description} input={o.input} example={o.example} skip={['op']} />)}
        </section>

        <section id="format" className="api-section">
          <h2>File format</h2>
          <p>
            A diagram is one JSON file (<code>"format": "paradox-diagram"</code>, <code>"version": 1</code>), the same as
            Export → JSON. Lengths are in millimetres. The JSON Schema is at <a href="api/schema.json">api/schema.json</a>,
            and the device types and their ports are in <a href="icons/index.json">icons/index.json</a>.
          </p>
        </section>

        <section id="safety" className="api-section">
          <h2>The live link</h2>
          <ul>
            <li>The server listens on 127.0.0.1 only: no other computer can reach it.</li>
            <li>The link has a random token, new each time the server starts. A tab without it is refused.</li>
            <li>Only this site (and pages on localhost) may connect.</li>
            <li>The link works only while the AI app runs the server. The part after <code>#</code> never goes to a web server.</li>
          </ul>
        </section>

        <section id="trouble" className="api-section">
          <h2>Troubleshooting</h2>
          <dl className="api-trouble">
            <dt>The browser asks to allow access to devices on the local network</dt>
            <dd>Allow it: the server is on your own computer. If the badge never says connected, use the second link that <code>open_in_browser</code> gives (<code>http://127.0.0.1:…</code>). It is the same app, served by the server itself.</dd>
            <dt>“This AI server is another version”</dt>
            <dd>The site and the server must match. Restart the AI app, or run <code>npx -y @paradox2102/diagram-mcp@latest</code> once.</dd>
            <dt>“Live · AI server stopped”</dt>
            <dd>The AI app closed the server. The diagram stays in this browser; the file has every change up to that point.</dd>
            <dt>The AI cannot find a device</dt>
            <dd>Ask it to use <code>search_devices</code> with fewer words. Missing a device? Open an issue on <a href="https://github.com/Paradox2102/ParadoxDiagram/issues">GitHub</a>.</dd>
          </dl>
        </section>
      </main>
    </div>
  );
}
