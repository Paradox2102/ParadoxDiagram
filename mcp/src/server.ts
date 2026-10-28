// @paradox2102/diagram-mcp: the MCP server for Paradox Diagram (stdio).
import pkg from '../package.json' with { type: 'json' };

const USAGE = `diagram-mcp ${pkg.version}: an MCP server that lets an AI agent build a Paradox Diagram with you.

Usage: npx -y @paradox2102/diagram-mcp [--file <path>] [--port <n>] [--site <origin>]
  --file   the diagram file to open at start (else the AI calls new_diagram or open_diagram)
  --port   the port of the live link on 127.0.0.1 (default 0: any free port)
  --site   the site that may connect (default https://diagram.team2102.org)
`;

export async function main(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return;
  }
}

void main(process.argv.slice(2));
