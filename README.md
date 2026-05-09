# Claude Server

Claude Agent SDK 기반 HTTP API 서버. Claude Code SDK를 REST API로 래핑한다.

## 아키텍처

```
HTTP Request → Express Routes → Chat Service → SDK Runner → Claude Agent SDK query()
                                    │                │
                                    ├─ Session       ├─ System Prompt (base + client)
                                    └─ Tool Config   ├─ canUseTool callback
                                                     └─ Agent Definitions
```

## 프로젝트 구조

```
src/
├── index.ts                # Express 앱 (미들웨어, 라우트 등록, graceful shutdown)
├── config.ts               # Zod 기반 환경변수 검증
├── routes/
│   ├── health.ts           # GET /health, /status
│   ├── chat.ts             # POST /chat (SSE, sync, async 3모드)
│   ├── openai.ts           # OpenAI 호환 엔드포인트 (/v1/chat/completions, /v1/responses, /v1/models)
│   └── sessions.ts         # 세션 CRUD
├── services/
│   ├── chat-service.ts     # Chat 오케스트레이션 (세션, 도구 설정, SDK 실행)
│   └── auth.ts             # 토큰 검증
├── session/
│   └── manager.ts          # 세션 생명주기 + 파일 영속화
├── claude/
│   └── runner.ts           # SDK query() 호출, SSE 이벤트 변환
├── tools/
│   ├── index.ts            # 도구 권한 설정 빌더
│   ├── permission.ts       # canUseTool 콜백 (패턴 매칭)
│   └── allowed-tools.ts    # 기본 허용/차단 도구 목록
├── types/                  # TypeScript 타입 정의
├── middleware/             # auth, error-handler, request-logger
└── utils/                  # logger, sanitizer 등

prompts/
└── server-base.md          # 서버 기본 시스템 프롬프트
```

## 빌드 & 실행

```bash
npm ci              # 의존성 설치
npm run build       # TypeScript 컴파일
npm run dev         # 개발 모드 (tsx watch)
npm start           # 프로덕션 실행
npm test            # 테스트 실행 (vitest)
```

## 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| PORT | - | 9001 | 서버 포트 |
| AUTH_TOKEN | O | - | API 인증 Bearer 토큰 |
| CLAUDE_CODE_OAUTH_TOKEN | O | - | Claude SDK OAuth 토큰 |
| CLAUDE_MODEL | - | opus | 기본 모델 (sonnet, opus) |
| CLAUDE_MAX_TURNS | - | 50 | 최대 에이전트 턴 |
| CLAUDE_TIMEOUT_MS | - | 1800000 | SDK 타임아웃 (30분) |
| WORKSPACE_DIR | - | /tmp/claude-server-workspace | 세션 영속화 + cwd 루트 |
| SESSION_TIMEOUT | - | 1800 | 세션 만료 (초) |
| ALLOWED_TOOLS | - | (기본 목록) | 허용 도구 (쉼표 구분) |
| DISABLED_TOOLS | - | (빈 문자열) | 추가 차단 도구 (쉼표 구분) |
| LOG_LEVEL | - | info | 로그 레벨 |

## 시스템 프롬프트

1. **서버 베이스** (`prompts/server-base.md`) — append 모드일 때 항상 포함
2. **클라이언트** (API 요청의 systemPrompt) — append 또는 replace

## 도구 권한

- **우선순위**: API 요청 > 환경변수 > 기본값
- **canUseTool 콜백**: 패턴 매칭 (`mcp__server__*`, `Bash(git commit:*)` 등)

## 엔드포인트

- `POST /chat` — 메인 (SSE 스트리밍 / 동기 JSON / async 3모드)
- `POST /v1/chat/completions` — OpenAI 호환
- `POST /v1/responses` — LangChain/n8n Agent 형식
- `GET /v1/models` — 모델 목록
- `GET /sessions`, `GET /sessions/:id`, `DELETE /sessions/:id`
- `GET /health`, `GET /status`
- `GET /docs` — Swagger UI

## 테스트

```bash
npm test                           # 전체 실행
npx vitest run tests/tools/        # tools 디렉토리만
```

## Docker

```bash
podman build -t claude-server:latest .
podman run -d --name claude-server --env-file .env -p 9001:9001 claude-server:latest
```
