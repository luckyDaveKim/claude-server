/**
 * 도구 권한 설정 빌더
 */

import { config } from '../config.js';
import { resolveAllowedTools, resolveDisabledTools, applyDisabledTools } from './allowed-tools.js';
import { createCanUseTool, type PermissionConfig } from './permission.js';

export type { PermissionConfig } from './permission.js';

export interface ToolConfig {
  permissionConfig: PermissionConfig;
  canUseTool: ReturnType<typeof createCanUseTool>;
}

export interface BuildToolConfigOptions {
  allowedTools?: string[];
  disabledTools?: string[];
}

/**
 * 도구 권한 설정 통합 빌더
 * 레이어드 우선순위: API 요청 > 환경변수 > 기본값
 */
export function buildToolConfig(options: BuildToolConfigOptions = {}): ToolConfig {
  const allowed = resolveAllowedTools(options.allowedTools, config.ALLOWED_TOOLS);
  const disabled = resolveDisabledTools(options.disabledTools, config.DISABLED_TOOLS);
  const finalAllowed = applyDisabledTools(allowed, disabled);

  const permissionConfig: PermissionConfig = { allowedTools: finalAllowed, disabledTools: disabled };
  return { permissionConfig, canUseTool: createCanUseTool(permissionConfig) };
}
