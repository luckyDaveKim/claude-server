import { describe, it, expect } from 'vitest';
import { createCanUseTool } from '../../src/tools/permission.js';

describe('createCanUseTool', () => {
  describe('exact match', () => {
    it('allows tool that is in allowedTools', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['Read', 'Glob', 'Grep'],
        disabledTools: [],
      });
      const result = await canUseTool({ tool_name: 'Read', input: {} });
      expect(result.allowed).toBe(true);
    });

    it('denies tool not in allowedTools', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['Read', 'Glob'],
        disabledTools: [],
      });
      const result = await canUseTool({ tool_name: 'Write', input: {} });
      expect(result.allowed).toBe(false);
      expect(result).toHaveProperty('reason');
    });

    it('denies tool in disabledTools even if in allowedTools', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['Read', 'WebSearch'],
        disabledTools: ['WebSearch'],
      });
      const result = await canUseTool({ tool_name: 'WebSearch', input: {} });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('disabled');
    });
  });

  describe('wildcard matching — MCP tools', () => {
    it('allows mcp tool via mcp__servername__* pattern', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['mcp__oss__*'],
        disabledTools: [],
      });
      const result = await canUseTool({ tool_name: 'mcp__oss__search-code', input: {} });
      expect(result.allowed).toBe(true);
    });

    it('denies mcp tool from different server', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['mcp__oss__*'],
        disabledTools: [],
      });
      const result = await canUseTool({ tool_name: 'mcp__atlassian__jira_search', input: {} });
      expect(result.allowed).toBe(false);
    });

    it('allows explicit mcp tool name pattern', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['mcp__naver-works__calendar_list_events'],
        disabledTools: [],
      });
      const result = await canUseTool({ tool_name: 'mcp__naver-works__calendar_list_events', input: {} });
      expect(result.allowed).toBe(true);
    });

    it('denies non-allowed mcp tool from restricted server', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: [
          'mcp__naver-works__calendar_list_events',
          'mcp__naver-works__calendar_view_event',
        ],
        disabledTools: [],
      });
      const result = await canUseTool({ tool_name: 'mcp__naver-works__mail_send', input: {} });
      expect(result.allowed).toBe(false);
    });
  });

  describe('wildcard matching — Bash patterns', () => {
    it('allows Bash(git commit:*) for git commit commands', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['Bash(git commit:*)'],
        disabledTools: [],
      });
      const result = await canUseTool({ tool_name: 'Bash(git commit -m "test")', input: {} });
      expect(result.allowed).toBe(true);
    });

    it('denies Bash command not matching pattern', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['Bash(git commit:*)'],
        disabledTools: [],
      });
      const result = await canUseTool({ tool_name: 'Bash(rm -rf /)', input: {} });
      expect(result.allowed).toBe(false);
    });

    it('allows npm commands via Bash(npm:*) pattern', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['Bash(npm:*)'],
        disabledTools: [],
      });
      const result = await canUseTool({ tool_name: 'Bash(npm test)', input: {} });
      expect(result.allowed).toBe(true);
    });
  });

  describe('disabledTools takes priority', () => {
    it('disabled wildcard overrides allowed wildcard', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['mcp__oss__*'],
        disabledTools: ['mcp__oss__*'],
      });
      const result = await canUseTool({ tool_name: 'mcp__oss__search-code', input: {} });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('disabled');
    });

    it('disabled exact match blocks specific MCP tool', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['mcp__oss__*'],
        disabledTools: ['mcp__oss__delete-repository'],
      });

      const searchResult = await canUseTool({ tool_name: 'mcp__oss__search-code', input: {} });
      expect(searchResult.allowed).toBe(true);

      const deleteResult = await canUseTool({ tool_name: 'mcp__oss__delete-repository', input: {} });
      expect(deleteResult.allowed).toBe(false);
    });
  });

  describe('SDK-style Bash (toolName="Bash", input={command:...})', () => {
    it('allows git commit via composed name from SDK input', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['Bash(git commit:*)'],
        disabledTools: [],
      });
      const result = await canUseTool({
        tool_name: 'Bash',
        input: { command: 'git commit -m "test"' },
      });
      expect(result.allowed).toBe(true);
    });

    it('denies rm command even when git is allowed', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['Bash(git commit:*)'],
        disabledTools: [],
      });
      const result = await canUseTool({
        tool_name: 'Bash',
        input: { command: 'rm -rf /' },
      });
      expect(result.allowed).toBe(false);
    });

    it('allows npm via SDK input', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['Bash(npm:*)'],
        disabledTools: [],
      });
      const result = await canUseTool({
        tool_name: 'Bash',
        input: { command: 'npm test' },
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('ToolSearch and LSP', () => {
    it('allows ToolSearch when in allowedTools', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['ToolSearch'],
        disabledTools: [],
      });
      const result = await canUseTool({ tool_name: 'ToolSearch', input: {} });
      expect(result.allowed).toBe(true);
    });

    it('allows LSP when in allowedTools', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['LSP'],
        disabledTools: [],
      });
      const result = await canUseTool({ tool_name: 'LSP', input: {} });
      expect(result.allowed).toBe(true);
    });

    it('denies LSP when in disabledTools', async () => {
      const canUseTool = createCanUseTool({
        allowedTools: ['LSP'],
        disabledTools: ['LSP'],
      });
      const result = await canUseTool({ tool_name: 'LSP', input: {} });
      expect(result.allowed).toBe(false);
    });
  });
});
