/**
 * 입력 새니타이징 - 프롬프트 인젝션 방지
 */

/**
 * HTML 태그 제거 + XML 태그 이스케이프 + 과도한 공백 정리
 */
export function sanitize(input: string | null | undefined): string {
  if (!input) return '';

  let result = input;

  // HTML 태그 제거
  result = result.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  result = result.replace(/<[^>]+>/g, '');

  // 과도한 공백/개행 정리
  result = result.replace(/\n{4,}/g, '\n\n\n');
  result = result.replace(/[ \t]{4,}/g, '   ');

  return result.trim();
}

/**
 * XML 태그를 이스케이프하여 프롬프트 인젝션 방지
 * 사용자 입력이 XML context 태그와 충돌하지 않도록 함
 */
export function escapeXmlTags(input: string): string {
  if (!input) return '';

  // 시스템이 사용하는 XML 태그와 충돌할 수 있는 패턴 이스케이프
  return input
    .replace(/<(\/?)(?:user_request|pr_info|pr_body|review_comments|comments|changed_files|issue_info|issue_body|github_context)(\s[^>]*)?>/gi,
      '&lt;$1$2$3&gt;');
}
