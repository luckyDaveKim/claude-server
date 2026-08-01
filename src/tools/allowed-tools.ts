/**
 * 도구 접근 제어
 * 레이어드 우선순위: API 요청 > 환경변수 > 기본값
 */

export const DEFAULT_ALLOWED_TOOLS: readonly string[] = [
  'Read', 'Glob', 'Grep',
  'Edit', 'Write', 'NotebookEdit', 'Task',
  'Skill',
  'ToolSearch',
  'Bash(git add:*)', 'Bash(git commit:*)', 'Bash(git push:*)',
  'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)',
  'Bash(git checkout:*)', 'Bash(git branch:*)', 'Bash(git rm:*)',
  'Bash(git clone:*)', 'Bash(git fetch:*)', 'Bash(git pull:*)',
  'Bash(npm:*)', 'Bash(npx:*)',
  'Bash(yarn:*)', 'Bash(pnpm:*)', 'Bash(bun:*)',
];

export const DEFAULT_DISABLED_TOOLS: readonly string[] = ['WebSearch', 'WebFetch'];

/**
 * 허용 도구 해석 (레이어드 우선순위)
 * 1. API 요청 allowedTools
 * 2. 환경변수 ALLOWED_TOOLS (comma-separated)
 * 3. DEFAULT_ALLOWED_TOOLS
 */
export function resolveAllowedTools(
  apiTools?: string[],
  envToolsStr?: string,
): string[] {
  if (apiTools && apiTools.length > 0) {
    return [...apiTools];
  }

  if (envToolsStr) {
    return envToolsStr.split(',').map(t => t.trim()).filter(Boolean);
  }

  return [...DEFAULT_ALLOWED_TOOLS];
}

/**
 * 차단 도구 해석 (누적 병합)
 */
export function resolveDisabledTools(
  apiTools?: string[],
  envToolsStr?: string,
): string[] {
  const all = new Set<string>(DEFAULT_DISABLED_TOOLS);

  if (envToolsStr) {
    for (const t of envToolsStr.split(',').map(s => s.trim()).filter(Boolean)) {
      all.add(t);
    }
  }

  if (apiTools) {
    for (const t of apiTools) {
      all.add(t);
    }
  }

  return [...all];
}

export function applyDisabledTools(
  allowed: string[],
  disabled: string[],
): string[] {
  if (disabled.length === 0) return allowed;
  return allowed.filter(t => !disabled.includes(t));
}
