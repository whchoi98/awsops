# Plan — NFM 임계 알림 + AI 분석 루프 + 7일 모니터 추이 차트

> 원천 / Source: 실사용 사례에서 검증된 워크플로우 (페어별 NFM 모니터가 발행하는 CW 메트릭의 Grafana 시각화 + 타임아웃 임계 알림[출발지/목적지 페어+건수+차트] + 알림 스레드에서 AI 분석 봇 호출) + 원조 nfm-dashboard(CloudFront) 기능 대조.
> 핵심 통찰: 그 Grafana 데이터원은 특별한 게 아니라 **페어별 NFM 모니터가 발행하는 CW `AWS/NetworkFlowMonitor` 메트릭** — awsops HealthBand가 이미 쓰는 경로. 부족한 건 ①7일 멀티모니터 차트 ②임계 평가+알림 ③알림→AI 분석 동선 세 조각.
> Posture: 전부 read-only + governed SNS notify (notify.tf/ADR-040·041 선례 클래스). **CW Alarm 생성 금지(ADR-005 — AWS 리소스 변경)** — 임계 평가는 자체 워커 Lambda가 수행. AWS mutation/autonomy 없음.
> 실무 제약(참고): NFM은 inside-of-AWS만 커버, NLB TCP 세션 타임아웃 미제공 — NLB 보완 섹션은 별도 후속(Out of scope).

## W1 — 7일 모니터 추이 차트 (web only, tf 없음) — ✅ 완료 (2026-08-20~22, 실브라우저 검증)

> 구현 중 확장: 4패널 동시 그리드 + Max/Mean/Last 통계 범례(Grafana 패리티) + 커서 동기화
> + 모니터 커버리지 배지 + **스파이크 클릭 → 그 시점 1h 창으로 플로우 조회 드릴다운**
> (실측: monitor 쿼리 1h 캡은 창 길이 제약일 뿐, 과거 창 조회 가능).

Grafana 영상1과 동등한 뷰: 모니터(=페어)별 멀티 시리즈, 최대 7일.

- `lib/nfm.ts`: `nfmFleetTimeline(rangeSec)` — 전 모니터 × 5메트릭(Timeouts·Retransmissions·RoundTripTime·HealthIndicator·DataTransferred) GetMetricData 1~2콜 배치 (콜당 500쿼리 한도 — 모니터 수십 개까지 여유). 기존 TTL 캐시 + in-flight dedupe 재사용. RTT는 **µs**(1000배 함정) — `nfm-format` 단일 변환 지점 경유.
- `/api/nfm/timeline` 신규 — health 라우트 패턴 답습: 이름→ARN 서버측 allow-list 해석(ARN 비노출 유지), NFM/CW 실패는 200 degrade.
- 페이지: HealthBand 아래 "모니터별 추이" 카드 — 메트릭 셀렉트 + 모니터별 멀티 시리즈 차트 + **/GB 정규화 토글**(재전송·타임아웃을 DataTransferred로 나눔 — 원조 dashboard의 "에러 신호 /GB" 패널 채용; 트래픽 증가에 따른 절대 건수 착시 제거).
- 기간 프리셋: 1h/6h/24h/7d — **쿼리 패널의 `NFM_RANGE_PRESETS`(1h 캡)와 분리** (1h 캡은 top-contributors 라이브 쿼리 한도일 뿐, CW 경로는 무관). 7d는 CW 5-min 해상도(63일 내) — period 자동 산정은 `nfmHealthSummary` 로직 일반화.

## ~~W2 — 임계 평가 + SNS 알림~~ — **드롭 (owner 결정 2026-08-22)**

> 알림 기능은 넣지 않기로 결정. 아래 설계는 재개 시 참고용으로만 보존 — W2가 빠지면서
> W3의 알림 딥링크 착지(`?monitor=` 프리필)도 불필요해져 미구현으로 남긴다.
> 루프의 "감지" 단계는 당분간 사람이 추이 차트에서 스파이크를 보고 클릭하는 것으로 대체
> (W1의 스파이크 클릭 → 시점 창 드릴다운 + W3 챗 분석이 그 동선).

<details><summary>보존된 원안</summary>

Grafana 알림 룰의 기능 등가물 — CW Alarm 생성 없이.

- `scripts/v2/workers/nfm_threshold.py` — EventBridge rate(5m) Lambda (schedule_dispatcher 패턴 — advance-first claim, per-row 실패 비전파):
  1. CW GetMetricData로 최근 평가 윈도우의 모니터별 Timeouts/Retransmissions(+DataTransferred, /GB 정규화용) 조회
  2. SSM 튜너블 임계 비교 (`/ops/awsops-v2/nfm/alert-{timeouts,retx-per-gb,window-s,cooldown-s}` — W2b SSM 튜너블 패턴)
  3. 초과 시 기존 diagnosis SNS 토픽으로 publish (구독 관리 UI 재사용) — 메시지: 모니터명(=페어), 메트릭, 값/임계, 윈도우, **딥링크 2개**(`/network-flow?monitor=…` + `/assistant?section=nfm-analyze&monitor=…`)
- Dedup/cooldown 상태: `nfm_alert_state` 테이블 (schema v10 마이그레이션 — monitor, metric, last_fired_at, last_value; cooldown 내 재발화 억제)
- terraform (`notify.tf` 확장 또는 `nfm-alerts.tf` 신규): Lambda + EventBridge rule + IAM(`cloudwatch:GetMetricData`, `networkflowmonitor:ListMonitors`, 기존 토픽 한정 `sns:Publish`, SSM read) — 전부 `nfm_alerts_enabled` count 게이트 → OFF=0리소스/$0, plan=No changes. apply는 컨트롤러.

</details>

## W3 — `nfm-analyze` 콜렉터 (auto-collect 7번째) — ✅ 완료 (2026-08-22, 라이브 E2E 검증)

필드에서 검증된 알림-스레드 분석 봇의 등가물 — 챗 안에서.

- `web/lib/collectors/nfm-analyze.ts` — 레지스트리 계약(등록 한 줄):
  - `available()`: `nfmStatus()` 모니터 ≥ 1
  - `collect()`: ① 전 모니터 health summary(악화 모니터 선별 — HealthIndicator>0 또는 Timeouts 상위) ② 해당 모니터 top-contributors (TIMEOUTS·RETRANSMISSIONS·DATA_TRANSFERRED, 1h) — 어떤 pod↔pod/서브넷 페어가 원인인지 ③ (가용 시) Container Insights 로그 요약 — 미가용 소스는 '미가용' disclose (계약: 부분 실패가 전체를 죽이지 않음)
  - 수집 데이터는 attacker-influenced 문자열 가능(pod명 등) — 기존 tagged-DATA injection containment 경로 그대로
- SECTIONS UI 키 + i18n 4언어 등록. 챗 프리필: `?monitor=` 쿼리 수용 (W2 딥링크의 착지점).

## 순서 / 브랜치

**W1 → W3 → W2** (tf apply 없는 web 작업 먼저; W2는 tf plan 게이트 + 컨트롤러 apply). 각 W = TDD red→green, 작은 단위 즉시 커밋. 브랜치: `feat/nfm-alert-ai-loop` (현 `feat/nfm-health-band` 머지 후).

## Out of scope

- 서브넷/AZ 페어 **집계 뷰** (백로그 #2 — 별도 소작업)
- Workload Insights 계정 전체 뷰 (별도 항목)
- **NLB TCP 타임아웃 보완 섹션** (실무 pain — NFM 커버리지 밖; NLB CW 메트릭 기반 별도 계획)
- Slack 양방향 봇 (v1은 SNS 이메일 + 딥링크)
- CW Alarm 생성 (ADR-005 FROZEN — 영구 제외)
- 히스토리 수집 파이프라인 (CW 보관 15개월로 7d 요구 충족 — 불필요)
