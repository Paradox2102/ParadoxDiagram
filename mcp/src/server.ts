// @paradox2102/diagram-mcp: the MCP server for Paradox Diagram (stdio). Logs go to stderr; stdout is the MCP channel.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import pkg from '../package.json' with { type: 'json' };
import { loadNodeCatalog } from './catalog';
import { DiagramStore, resolvePath } from './store';
import { INSTRUCTIONS, PROMPT, TOOLS, toolsJson, type ToolContext } from './tools';

export const DEFAULT_SITE = 'https://diagram.team2102.org';

const USAGE = `diagram-mcp ${pkg.version}: an MCP server that lets an AI agent build a Paradox Diagram with you.

Usage: npx -y @paradox2102/diagram-mcp [--file <path>] [--port <n>] [--site <origin>]
  --file   the diagram file to open at start (made when it does not exist)
  --port   the port of the live link on 127.0.0.1 (default 0: any free port)
  --site   the site that may connect (default ${DEFAULT_SITE})
  --dump-tools   print the tool reference as JSON and stop
`;

export interface Args {
  file?: string;
  port: number;
  site: string;
  help: boolean;
  dumpTools: boolean;
}

export function parseArgs(argv: string[]): Args {
  const out: Args = { port: 0, site: DEFAULT_SITE, help: false, dumpTools: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dump-tools') out.dumpTools = true;
    else if (a === '--file') out.file = value();
    else if (a === '--port') {
      out.port = Number(value());
      if (!Number.isInteger(out.port) || out.port < 0 || out.port > 65535) throw new Error('--port must be a number from 0 to 65535');
    } else if (a === '--site') out.site = new URL(value()).origin;
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

/** Open a link in the default browser; the link goes as one argument, never through a shell. */
function openUrl(url: string) {
  if (process.env.PARADOX_NO_BROWSER) return;
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.on('error', (e) => process.stderr.write(`could not open the browser: ${e.message}\n`));
  child.unref();
}

export async function main(argv: string[]): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (args.dumpTools) {
    process.stdout.write(`${JSON.stringify(toolsJson(), null, 2)}\n`);
    return;
  }

  const catalog = loadNodeCatalog();
  const store = new DiagramStore(catalog);
  if (args.file) {
    const file = resolvePath(args.file);
    if (existsSync(file)) store.open(file);
    else store.create(file);
  }
  const ctx: ToolContext = { store, catalog, live: null, openUrl };

  const server = new McpServer({ name: 'paradox-diagram', version: pkg.version }, { instructions: INSTRUCTIONS });
  for (const t of TOOLS) {
    server.registerTool(t.name, { title: t.title, description: t.description, inputSchema: t.input }, async (input: unknown) => {
      try {
        return await t.run(ctx, input as never);
      } catch (e) {
        return { isError: true, content: [{ type: 'text' as const, text: (e as Error).message }] };
      }
    });
  }
  server.registerPrompt(
    'build_robot_diagram',
    {
      title: 'Build my robot diagram',
      description: 'Asks for the robot\'s devices, then builds the diagram with you.',
      argsSchema: { robot: z.string().optional().describe('What you already know about the robot.') },
    },
    ({ robot }) => ({ messages: [{ role: 'user', content: { type: 'text', text: robot ? `${PROMPT}\n\nWhat I know:\n${robot}` : PROMPT } }] }),
  );
  await server.connect(new StdioServerTransport());
  process.stderr.write(`diagram-mcp ${pkg.version} ready${store.file ? `: ${store.file}` : ''}\n`);
}

void main(process.argv.slice(2));
