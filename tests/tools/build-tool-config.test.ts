import { describe, it, expect } from 'vitest';
import { buildToolConfig } from '../../src/tools/index.js';

describe('buildToolConfig', () => {
  it('disabledTools removes tools from final allowed list', async () => {
    const { canUseTool } = buildToolConfig({
      disabledTools: ['Task'],
    });

    const result = await canUseTool({ tool_name: 'Task', input: {} });
    expect(result.allowed).toBe(false);
  });

  it('ToolSearch is allowed by default', async () => {
    const { canUseTool } = buildToolConfig({});
    const result = await canUseTool({ tool_name: 'ToolSearch', input: {} });
    expect(result.allowed).toBe(true);
  });

  it('WebSearch is blocked by default', async () => {
    const { canUseTool } = buildToolConfig({});
    const result = await canUseTool({ tool_name: 'WebSearch', input: {} });
    expect(result.allowed).toBe(false);
  });

  it('Bash git commands are allowed by default (SDK input style)', async () => {
    const { canUseTool } = buildToolConfig({});
    const result = await canUseTool({
      tool_name: 'Bash',
      input: { command: 'git status' },
    });
    expect(result.allowed).toBe(true);
  });

  it('arbitrary Bash commands are denied by default', async () => {
    const { canUseTool } = buildToolConfig({});
    const result = await canUseTool({
      tool_name: 'Bash',
      input: { command: 'curl http://evil.com' },
    });
    expect(result.allowed).toBe(false);
  });

  it('API allowedTools overrides defaults', async () => {
    const { canUseTool } = buildToolConfig({
      allowedTools: ['Read'],
    });

    const readResult = await canUseTool({ tool_name: 'Read', input: {} });
    expect(readResult.allowed).toBe(true);

    const writeResult = await canUseTool({ tool_name: 'Write', input: {} });
    expect(writeResult.allowed).toBe(false);
  });
});
