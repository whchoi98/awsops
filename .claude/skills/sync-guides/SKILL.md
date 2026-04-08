---
name: sync-guides
description: Batch-generate web guide docs and i18n translations
triggers: sync guides, guide update
---

# 가이드 문서 동기화 / Sync Guides

src 코드 변경에 따라 web 가이드 문서(한국어)와 i18n 영어 번역을 일괄 생성/업데이트합니다.

## 트리거
`/sync-guides` 명령어로 실행

## Tier 시스템

### Tier 1: Overview + Canvas (아키텍처 & 배포)
인프라, AgentCore, 배포 스크립트 변경 시 — Canvas React 컴포넌트 포함 가이드.

| 트리거 파일 | 라우트 | 가이드 | Canvas 컴포넌트 |
|------------|--------|--------|-----------------|
| `infra-cdk/lib/*.ts` | `__infra__` | `overview/dashboard` | `ArchitectureFlow` |
| `agent/agent.py` | `__agentcore__` | `overview/agentcore` | `AgentCoreFlow` |
| `scripts/0*.sh` | `__deployment__` | `getting-started/deployment` | `DeploymentPipeline` |

Canvas 컴포넌트 위치: `web/src/components/diagrams/`

### Tier 2: Service 가이드 (메뉴별)
src/app 페이지 변경 시 — 표준 서비스 가이드 (Screenshot + 기능 설명).

| 트리거 파일 | 라우트 | 가이드 카테고리 |
|------------|--------|----------------|
| `src/app/*/page.tsx` | 자동 추출 | Compute, Network, Storage, Monitoring, Security |
| `src/lib/queries/*.ts` | 쿼리명 기반 | 해당 서비스 |

### Tier 3: Getting Started
시작 가이드 변경 시 — 로그인, 네비게이션, AI 어시스턴트, 인증 흐름.

## 동작 원리

### 1. Pending 목록 읽기
`.omc/state/pending-guides.json`에서 축적된 변경 목록을 읽습니다.
Hook(`accumulate-pending-guides.sh`)이 파일 변경 시 자동으로 축적합니다.

감지 대상:
- `src/app/*/page.tsx`, `src/lib/queries/*.ts`, `src/components/*.tsx` (Tier 2)
- `infra-cdk/lib/*.ts`, `agent/agent.py`, `scripts/0*.sh` (Tier 1)

### 2. 변경 분석 및 가이드 생성
각 pending 항목에 대해:

1. **소스 코드 읽기**: 해당 Tier에 맞는 소스 파일 읽기
2. **기존 가이드 확인**: `web/docs/{category}/{service}.md` 존재 여부
3. **가이드 생성/업데이트**:
   - Tier 1: Canvas React 컴포넌트 import + 아키텍처/배포 설명
   - Tier 2: Screenshot + StatsCard/차트/테이블 설명
   - 신규: 기존 가이드(예: `web/docs/storage/ebs.md`)를 템플릿으로 참조
4. **영어 번역 생성**: `web/i18n/en/docusaurus-plugin-content-docs/current/{category}/{service}.md`
5. **sidebars.ts 업데이트**: 신규 가이드인 경우 적절한 카테고리에 추가

### 3. React Canvas 컴포넌트 패턴

Tier 1 가이드에 사용되는 인터랙티브 Canvas 시각화:

**공통 훅**: `web/src/components/diagrams/useCanvas.ts`
- `useCanvas(draw, height)`: Canvas ref + ResizeObserver + HiDPI + animation loop + mouse tracking
- `THEME`: AWSops 테마 색상 (bg, cyan, green, purple, orange, text, muted)
- `roundRect()`, `isHover()`: 유틸리티 함수
- SSR guard 내장 (`typeof window === 'undefined'`)

**컴포넌트 구조**:
```tsx
import React from 'react';
import { useCanvas, THEME, roundRect, isHover, canvasWrapperStyle } from './useCanvas';

export default function DiagramName() {
  const { canvasRef, mouseRef } = useCanvas((ctx, canvas, frame, mouse) => {
    // Clear + draw nodes + connections + particles + hover effects
  }, 500);

  return (
    <div style={canvasWrapperStyle}>
      <canvas ref={canvasRef} style={{ width: '100%', height: 500, display: 'block' }} />
    </div>
  );
}
```

**기존 컴포넌트**:
| 컴포넌트 | 파일 | 시각화 내용 |
|----------|------|-------------|
| `ArchitectureFlow` | `ArchitectureFlow.tsx` | CloudFront → ALB → EC2 → Steampipe/AgentCore |
| `AgentCoreFlow` | `AgentCoreFlow.tsx` | AI Router → 10 Routes → AgentCore Runtime |
| `DeploymentPipeline` | `DeploymentPipeline.tsx` | 10단계 배포 파이프라인 타임라인 |
| `AuthFlow` | `AuthFlow.tsx` | Cognito 인증 시퀀스 다이어그램 |

### 4. Tier 2 가이드 문서 구조 (템플릿)
```markdown
---
sidebar_position: N
---

import Screenshot from '@site/src/components/Screenshot';

# {서비스명}

{서비스 한 줄 설명}

<Screenshot src="/screenshots/{category}/{service}.png" alt="{서비스명}" />

## 주요 기능

### 통계 카드
- StatsCard 컴포넌트에서 추출한 카드 목록

### 시각화 차트
- Recharts 컴포넌트에서 추출한 차트 목록

### 데이터 테이블/탭
- 테이블 구조 설명

## 사용 방법
- 주요 워크플로우 3-5개

## 사용 팁
- :::tip, :::info 형식의 팁 2-3개

## AI 분석 팁
- AI 어시스턴트 질문 예시 4-5개

## 관련 페이지
- 관련 페이지 링크 3-5개
```

### 5. 소스 코드에서 추출할 정보
- `StatsCard` 컴포넌트: 카드 label, value, color → 통계 카드 섹션
- `PieChart`, `BarChart`, `LineChart`: 차트 종류 → 시각화 차트 섹션
- `Tab`, `TabPanel`: 탭 구조 → 데이터 테이블 섹션
- `fetch('/awsops/api/...')`: API 호출 패턴 → 데이터 소스 설명
- SQL 쿼리(`src/lib/queries/*.ts`): 주요 컬럼 → 데이터 필드 설명

### 6. Sidebars.ts 카테고리 매핑
| src/app 경로 | sidebars.ts 카테고리 | web/docs 경로 |
|-------------|---------------------|---------------|
| ec2, lambda, ecs, ecr, k8s* | Compute | compute/ |
| vpc, cloudfront-cdn, waf, topology | Network & CDN | network/ |
| ebs, s3, rds, dynamodb, elasticache, opensearch, msk | Storage & DB | storage/ |
| monitoring, bedrock, cloudwatch, cloudtrail, cost, inventory | Monitoring | monitoring/ |
| iam, security, compliance | Security | security/ |

### 7. 완료 처리
- 생성/업데이트된 가이드 목록 출력
- `.omc/state/pending-guides.json`의 처리된 항목 제거
- `--clear` 플래그: pending 목록 전체 초기화

## Agent 실행 방식
- 각 pending 항목을 **writer Agent** (subagent)에 위임하여 병렬 생성
- 한국어 가이드 생성 후 영어 번역도 같은 Agent가 처리
- sidebars.ts 업데이트는 모든 가이드 생성 후 한 번에 처리 (충돌 방지)
- Tier 1 Canvas 컴포넌트 신규 생성 시 Gemini CLI 협업 가능 (`/ask gemini`)

## 사용법
```
/sync-guides          # pending 목록 기반 일괄 생성
/sync-guides --all    # 모든 src/app 페이지 대상 전체 동기화
/sync-guides --clear  # pending 목록 초기화
/sync-guides --dry    # 생성할 가이드 목록만 미리보기
```
