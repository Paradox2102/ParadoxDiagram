import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiPage, CLAUDE_CODE, MCP_JSON } from './ApiPage';

const reference = {
  tools: [
    { name: 'search_devices', title: 'Search devices', description: 'Find device types.', input: { type: 'object', properties: { query: { type: 'string', description: 'Words' } }, required: ['query'] }, example: { query: 'pdh' } },
    { name: 'edit', title: 'Edit the diagram', description: 'Change the diagram.', input: { type: 'object', properties: { ops: { type: 'array', items: { oneOf: [{ type: 'object', properties: { op: { const: 'connect' } } }] } } }, required: ['ops'] }, example: { ops: [] } },
  ],
  ops: [{ op: 'connect', description: 'Draw a wire.', input: { type: 'object', properties: { op: { const: 'connect' }, from: { type: 'string', description: 'A port' } }, required: ['op', 'from'] }, example: { op: 'connect', from: 'pdh.ch4' } }],
  instructions: '1. new_diagram',
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(reference))));
});
afterEach(() => vi.unstubAllGlobals());

test('ApiPage shows each tool and op from tools.json, with parameters and an example', async () => {
  render(<ApiPage />);
  const tool = await screen.findByRole('heading', { name: 'search_devices' });
  const card = tool.closest('article')!;
  expect(within(card).getByText('query')).toBeInTheDocument();
  expect(within(card).getByText('required')).toBeInTheDocument();
  expect(within(card).getByText(/"query": "pdh"/)).toBeInTheDocument();
  const edit = screen.getByRole('heading', { name: 'edit' }).closest('article')!;
  expect(within(edit).getByText('operation[]')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'connect' })).toBeInTheDocument();
});

test('copy buttons copy the exact setup text', async () => {
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText');
  render(<ApiPage />);
  await user.click(screen.getByRole('button', { name: 'Copy the Claude Code command' }));
  expect(writeText).toHaveBeenLastCalledWith(CLAUDE_CODE);
  await user.click(screen.getByRole('button', { name: 'Copy the MCP config' }));
  expect(writeText).toHaveBeenLastCalledWith(MCP_JSON);
  expect(CLAUDE_CODE).toBe('claude mcp add paradox-diagram -- npx -y @paradox2102/diagram-mcp');
  expect(JSON.parse(MCP_JSON)).toEqual({ mcpServers: { 'paradox-diagram': { command: 'npx', args: ['-y', '@paradox2102/diagram-mcp'] } } });
});

test('a failed load says so', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
  render(<ApiPage />);
  expect(await screen.findByText(/The tool reference did not load/)).toBeInTheDocument();
});
