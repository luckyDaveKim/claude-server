# Claude Server

Claude Agent SDK 기반 HTTP API 서버.

## 빌드 & 실행

```bash
npm ci && npm run build    # 빌드
npm run dev                # 개발 모드
npm test                   # 테스트 (vitest)
```

## 핵심 흐름

```
Routes → ChatService → SDK Runner (runner.ts) → Claude Agent SDK query()
```

- 시스템 프롬프트: 서버 베이스(`prompts/server-base.md`) + 클라이언트 (append/replace)
- 도구 권한: API 요청 > 환경변수 > 기본값 (`allowed-tools.ts`)
- 세션 영속화: `${WORKSPACE_DIR}/sessions-index.json`, 세션별 cwd `${WORKSPACE_DIR}/sessions/${id}`

## 테스트

```bash
npm test                           # 전체
npx vitest run tests/tools/        # tools만
```
