/**
 * canUseTool 콜백 팩토리
 * Claude SDK의 tool permission callback으로 사용
 */

export interface PermissionConfig {
  allowedTools: string[];
  disabledTools: string[];
}

/**
 * Wildcard pattern matching for tool names
 * Examples:
 *   "mcp__oss__*"       matches "mcp__oss__search-code"
 *   "Bash(git commit:*)" matches "Bash(git commit -m test)"
 */
function matchTool(pattern: string, toolName: string): boolean {
  if (pattern === toolName) return true;

  // Bash(cmd:*) pattern — ":" is separator before wildcard, not literal
  if (pattern.endsWith(':*)')) {
    const parenIdx = pattern.indexOf('(');
    if (parenIdx !== -1) {
      const prefix = pattern.slice(0, parenIdx + 1); // "Bash("
      const cmdPrefix = pattern.slice(parenIdx + 1, -3); // "git commit" (strip ":*)")
      if (toolName.startsWith(prefix) && toolName.endsWith(')')) {
        const cmd = toolName.slice(prefix.length, -1);
        return cmd.startsWith(cmdPrefix);
      }
    }
    return false;
  }

  // Simple suffix wildcard: mcp__oss__*
  if (pattern.endsWith('*')) {
    return toolName.startsWith(pattern.slice(0, -1));
  }

  return false;
}

/**
 * SDK canUseTool passes toolName="Bash" + input={command:"..."}
 * Compose to "Bash(command)" for pattern matching
 */
function getEffectiveToolName(toolName: string, input: unknown): string {
  if (toolName === 'Bash' && input && typeof input === 'object' && 'command' in input) {
    const command = (input as Record<string, unknown>).command;
    if (typeof command === 'string') {
      return `Bash(${command})`;
    }
  }
  return toolName;
}

export function createCanUseTool(config: PermissionConfig) {
  return async ({ tool_name, input }: { tool_name: string; input: unknown }) => {
    const effective = getEffectiveToolName(tool_name, input);

    if (config.disabledTools.some(p => matchTool(p, effective))) {
      return { allowed: false as const, reason: `Tool ${tool_name} is disabled` };
    }
    if (config.allowedTools.some(p => matchTool(p, effective))) {
      return { allowed: true as const };
    }
    return { allowed: false as const, reason: `Tool ${tool_name} not in allowed list` };
  };
}
