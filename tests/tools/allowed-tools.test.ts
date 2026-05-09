import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ALLOWED_TOOLS,
  DEFAULT_DISABLED_TOOLS,
  resolveAllowedTools,
  resolveDisabledTools,
  applyDisabledTools,
} from '../../src/tools/allowed-tools.js';

describe('DEFAULT_ALLOWED_TOOLS', () => {
  it('includes ToolSearch for MCP deferred tool discovery', () => {
    expect(DEFAULT_ALLOWED_TOOLS).toContain('ToolSearch');
  });

  it('includes NotebookEdit', () => {
    expect(DEFAULT_ALLOWED_TOOLS).toContain('NotebookEdit');
  });

  it('includes core read/write tools', () => {
    expect(DEFAULT_ALLOWED_TOOLS).toContain('Read');
    expect(DEFAULT_ALLOWED_TOOLS).toContain('Write');
    expect(DEFAULT_ALLOWED_TOOLS).toContain('Edit');
    expect(DEFAULT_ALLOWED_TOOLS).toContain('Glob');
    expect(DEFAULT_ALLOWED_TOOLS).toContain('Grep');
    expect(DEFAULT_ALLOWED_TOOLS).toContain('Task');
  });

  it('includes Bash git patterns', () => {
    const gitPatterns = DEFAULT_ALLOWED_TOOLS.filter(t => t.startsWith('Bash(git'));
    expect(gitPatterns.length).toBeGreaterThan(5);
  });

  it('includes Bash npm/npx patterns', () => {
    expect(DEFAULT_ALLOWED_TOOLS).toContain('Bash(npm:*)');
    expect(DEFAULT_ALLOWED_TOOLS).toContain('Bash(npx:*)');
  });

  it('does not include MCP tools', () => {
    const mcpTools = DEFAULT_ALLOWED_TOOLS.filter(t => t.startsWith('mcp__'));
    expect(mcpTools).toHaveLength(0);
  });
});

describe('DEFAULT_DISABLED_TOOLS', () => {
  it('blocks WebSearch and WebFetch by default', () => {
    expect(DEFAULT_DISABLED_TOOLS).toContain('WebSearch');
    expect(DEFAULT_DISABLED_TOOLS).toContain('WebFetch');
  });
});

describe('resolveAllowedTools', () => {
  it('returns API tools when provided (highest priority)', () => {
    const result = resolveAllowedTools(['Read', 'Grep'], 'Glob,Write');
    expect(result).toEqual(['Read', 'Grep']);
  });

  it('returns ENV tools when no API tools', () => {
    const result = resolveAllowedTools(undefined, 'Glob,Write,Edit');
    expect(result).toEqual(['Glob', 'Write', 'Edit']);
  });

  it('returns defaults when neither API nor ENV', () => {
    const result = resolveAllowedTools(undefined, undefined);
    expect(result).toEqual([...DEFAULT_ALLOWED_TOOLS]);
  });

  it('treats empty API array as no API tools (falls through to ENV)', () => {
    const result = resolveAllowedTools([], 'Glob');
    expect(result).toEqual(['Glob']);
  });

  it('trims whitespace in ENV tools', () => {
    const result = resolveAllowedTools(undefined, ' Read , Glob ');
    expect(result).toEqual(['Read', 'Glob']);
  });

  it('filters out empty strings from ENV', () => {
    const result = resolveAllowedTools(undefined, 'Read,,Glob,');
    expect(result).toEqual(['Read', 'Glob']);
  });
});

describe('resolveDisabledTools', () => {
  it('always includes defaults', () => {
    const result = resolveDisabledTools(undefined, undefined);
    expect(result).toContain('WebSearch');
    expect(result).toContain('WebFetch');
  });

  it('merges ENV disabled tools with defaults', () => {
    const result = resolveDisabledTools(undefined, 'CustomTool');
    expect(result).toContain('WebSearch');
    expect(result).toContain('WebFetch');
    expect(result).toContain('CustomTool');
  });

  it('merges API disabled tools with defaults', () => {
    const result = resolveDisabledTools(['Bash'], undefined);
    expect(result).toContain('WebSearch');
    expect(result).toContain('Bash');
  });

  it('merges all three layers (cumulative)', () => {
    const result = resolveDisabledTools(['Bash'], 'CustomTool');
    expect(result).toContain('WebSearch');
    expect(result).toContain('WebFetch');
    expect(result).toContain('CustomTool');
    expect(result).toContain('Bash');
  });

  it('deduplicates', () => {
    const result = resolveDisabledTools(['WebSearch'], 'WebSearch');
    const count = result.filter(t => t === 'WebSearch').length;
    expect(count).toBe(1);
  });
});

describe('applyDisabledTools', () => {
  it('removes disabled tools from allowed list', () => {
    const result = applyDisabledTools(['Read', 'WebSearch', 'Glob'], ['WebSearch']);
    expect(result).toEqual(['Read', 'Glob']);
  });

  it('returns all allowed when disabled is empty', () => {
    const allowed = ['Read', 'Glob'];
    const result = applyDisabledTools(allowed, []);
    expect(result).toEqual(allowed);
  });

  it('handles case where disabled tool is not in allowed', () => {
    const result = applyDisabledTools(['Read'], ['NotPresent']);
    expect(result).toEqual(['Read']);
  });
});
