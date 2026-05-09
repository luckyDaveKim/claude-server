// 도구 이름에 허용되지 않는 패턴
const DANGEROUS_PATTERNS = [
  '--',       // CLI 플래그 인젝션
  '&&',       // 명령 체이닝
  '||',       // 명령 체이닝
  '|',        // 파이프
  ';',        // 명령 구분
  '`',        // 백틱 실행
  '$(',       // 서브쉘
  '\n',       // 개행 인젝션
  '\r',       // 캐리지 리턴 인젝션
];

/**
 * 사용자가 전달한 도구 이름이 안전한지 검증
 * additionalTools 파라미터 검증에 사용
 */
export function validateToolName(tool: string): boolean {
  if (!tool || tool.length === 0 || tool.length > 200) {
    return false;
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (tool.includes(pattern)) {
      return false;
    }
  }

  return true;
}

/**
 * 도구 목록에서 위험한 항목 필터링
 */
export function filterValidTools(tools: string[]): string[] {
  return tools.filter(validateToolName);
}
