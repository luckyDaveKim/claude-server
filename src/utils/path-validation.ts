import * as fs from 'fs';
import * as path from 'path';

/**
 * 파일 경로가 repoRoot 내에 있는지 검증
 * - 경로 순회 (..) 방지
 * - symlink 해석 후 확인
 */
export function validatePath(filePath: string, repoRoot: string): boolean {
  try {
    // 절대 경로로 변환
    const absolutePath = path.resolve(repoRoot, filePath);

    // symlink 해석
    let resolvedPath: string;
    try {
      resolvedPath = fs.realpathSync(absolutePath);
    } catch {
      // 파일이 아직 없는 경우 (Write 대상) → 부모 디렉토리로 확인
      const parentDir = path.dirname(absolutePath);
      try {
        resolvedPath = path.join(fs.realpathSync(parentDir), path.basename(absolutePath));
      } catch {
        // 부모 디렉토리도 없으면 정규화된 경로로 확인
        resolvedPath = absolutePath;
      }
    }

    const resolvedRoot = fs.realpathSync(repoRoot);

    // repoRoot 내에 있는지 확인
    return resolvedPath.startsWith(resolvedRoot + path.sep) || resolvedPath === resolvedRoot;
  } catch {
    return false;
  }
}
