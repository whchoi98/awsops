---
remarp: true
block: 01
title: "Why AWSops"
---

<!-- Slide 1: Session Cover -->

@type: cover
@transition: fade

# AWSops
## AI-Powered AWS Operations Dashboard

Junseok Oh | Solutions Architect | AWS

:::notes
{timing: 1min}
안녕하세요, AWS Solutions Architect 오준석입니다.
오늘은 AWSops라는 AI 기반 AWS 운영 대시보드를 소개해 드리겠습니다.
클라우드 운영의 복잡성을 어떻게 해결하고, AI가 어떤 역할을 할 수 있는지 함께 살펴보겠습니다.
{cue: transition}
먼저 왜 이런 도구가 필요한지부터 시작하겠습니다.
:::

---

<!-- Slide 2: Agenda -->

@type: agenda

# Agenda

1. **Why AWSops** — 클라우드 운영의 도전 과제
2. **Architecture Deep Dive** — 기술 스택과 AI 에이전트
3. **Demo & Diagnosis Report** — 실전 시나리오와 종합진단

:::notes
{timing: 1min}
총 60분 세션으로 3개 파트로 나누어 진행합니다.
첫 번째로 왜 이런 도구가 필요한지, 두 번째로 어떻게 만들었는지, 세 번째로 실제로 어떻게 쓰는지를 보여드리겠습니다.
:::

---

<!-- Slide 3: The Challenge -->

@type: content
@transition: slide

# 클라우드 운영의 도전 과제

::: left

### Console Hopping

- EC2 확인 → CloudWatch → VPC → IAM → Cost Explorer
- **평균 5-7개 콘솔** 페이지를 오가며 문제 해결
- 멀티 어카운트 환경에서는 **로그인만 10번**

### 데이터 사일로

- CloudWatch 메트릭 ≠ Prometheus 메트릭 ≠ 로그 ≠ 트레이스
- **교차 분석 불가** → 근본 원인 파악 지연

:::

::: right

### 반복적 수작업

- "이 인스턴스 rightsizing 필요한가?"
- "미사용 리소스 정리해야 하는데..."
- **매번 같은 CLI 명령어** 반복 실행

### 보고서 작성 부담

- Well-Architected Review 수작업
- FinOps 리포트 매월 수동 작성
- **2-3일 소요** → 실시간성 부족

:::

:::notes
{timing: 3min}
클라우드 운영을 하다 보면 정말 많은 도전 과제에 직면합니다.

첫 번째는 Console Hopping입니다. 하나의 이슈를 해결하려면 EC2 콘솔에서 시작해서 CloudWatch로 메트릭 보고, VPC에서 네트워크 확인하고, IAM에서 권한 체크하고... 평균 5-7개 콘솔을 돌아다녀야 합니다. 멀티 어카운트면 로그인만 해도 지칩니다.

{cue: pause}

두 번째는 데이터 사일로입니다. CloudWatch 메트릭, Prometheus 메트릭, 로그, 트레이스가 각각 다른 시스템에 있어서 교차 분석이 어렵습니다. "CPU가 높아졌는데 어떤 서비스 때문이지?" 라는 질문에 답하려면 여러 도구를 동시에 봐야 합니다.

세 번째, 네 번째도 마찬가지로 반복 작업과 보고서 부담이 큽니다.

{cue: question}
여러분도 이런 경험 있으시죠? 특히 FinOps 리포트를 매달 수동으로 만들어 본 경험이 있으신 분?

{cue: transition}
AWSops는 이 4가지 문제를 동시에 해결합니다.
:::

---

<!-- Slide 4: AWSops Overview -->

@type: content
@transition: slide

# AWSops — Single Pane of Glass

:::html
<div class="tab-bar" style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
  <button class="tab-btn" style="padding:8px 16px;border:none;border-radius:6px;background:#00d4ff;color:#0a0e1a;font-weight:bold;cursor:pointer;font-size:14px;" onclick="(function(b,i){var p=b.closest('.slide-body')||b.parentNode.parentNode.parentNode;p.querySelectorAll('.tc').forEach(function(c,j){c.style.display=j===i?'block':'none'});var btns=b.parentNode.querySelectorAll('.tab-btn');btns.forEach(function(x){x.style.background='#1a2540';x.style.color='#b0b0b0';x.classList.remove('active')});b.style.background='#00d4ff';b.style.color='#0a0e1a';b.classList.add('active')})(this,0)">Data Layer</button>
  <button class="tab-btn" style="padding:8px 16px;border:none;border-radius:6px;background:#1a2540;color:#b0b0b0;font-weight:bold;cursor:pointer;font-size:14px;" onclick="(function(b,i){var p=b.closest('.slide-body')||b.parentNode.parentNode.parentNode;p.querySelectorAll('.tc').forEach(function(c,j){c.style.display=j===i?'block':'none'});var btns=b.parentNode.querySelectorAll('.tab-btn');btns.forEach(function(x){x.style.background='#1a2540';x.style.color='#b0b0b0';x.classList.remove('active')});b.style.background='#00d4ff';b.style.color='#0a0e1a';b.classList.add('active')})(this,1)">AI Engine</button>
  <button class="tab-btn" style="padding:8px 16px;border:none;border-radius:6px;background:#1a2540;color:#b0b0b0;font-weight:bold;cursor:pointer;font-size:14px;" onclick="(function(b,i){var p=b.closest('.slide-body')||b.parentNode.parentNode.parentNode;p.querySelectorAll('.tc').forEach(function(c,j){c.style.display=j===i?'block':'none'});var btns=b.parentNode.querySelectorAll('.tab-btn');btns.forEach(function(x){x.style.background='#1a2540';x.style.color='#b0b0b0';x.classList.remove('active')});b.style.background='#00d4ff';b.style.color='#0a0e1a';b.classList.add('active')})(this,2)">Dashboard</button>
</div>
<div class="tc" style="display:block;padding:12px;background:rgba(15,22,41,0.5);border-radius:8px;">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
  <div style="background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.3);border-radius:8px;padding:20px;">
    <div style="color:#00d4ff;font-weight:bold;font-size:18px;margin-bottom:8px;">Steampipe — SQL for Cloud</div>
    <div style="color:#b0b0b0;line-height:1.6;">AWS API를 PostgreSQL 테이블로 변환<br>CLI 대비 <span style="color:#00ff88;font-weight:bold;">660x</span> 빠른 쿼리 성능</div>
  </div>
  <div style="display:grid;grid-template-rows:1fr 1fr;gap:12px;">
    <div style="background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.2);border-radius:8px;padding:12px;text-align:center;">
      <div style="color:#00d4ff;font-size:28px;font-weight:bold;">380+</div>
      <div style="color:#8b95a5;font-size:13px;">AWS Tables</div>
    </div>
    <div style="background:rgba(0,255,136,0.05);border:1px solid rgba(0,255,136,0.2);border-radius:8px;padding:12px;text-align:center;">
      <div style="color:#00ff88;font-size:28px;font-weight:bold;">60+</div>
      <div style="color:#8b95a5;font-size:13px;">K8s Tables</div>
    </div>
  </div>
</div>
</div>
<div class="tc" style="display:none;padding:12px;background:rgba(15,22,41,0.5);border-radius:8px;">
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
  <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:20px;">
    <div style="color:#f59e0b;font-weight:bold;font-size:18px;margin-bottom:8px;">Bedrock AgentCore</div>
    <div style="color:#b0b0b0;line-height:1.6;">Claude Opus 4.6 (심층 분석)<br>Claude Sonnet 4.6 (빠른 분류)<br>AgentCore Runtime + MCP Gateway</div>
  </div>
  <div style="display:grid;grid-template-rows:1fr 1fr;gap:12px;">
    <div style="background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:12px;text-align:center;">
      <div style="color:#f59e0b;font-size:28px;font-weight:bold;">8</div>
      <div style="color:#8b95a5;font-size:13px;">MCP Gateways</div>
    </div>
    <div style="background:rgba(168,85,247,0.05);border:1px solid rgba(168,85,247,0.2);border-radius:8px;padding:12px;text-align:center;">
      <div style="color:#a855f7;font-size:28px;font-weight:bold;">125</div>
      <div style="color:#8b95a5;font-size:13px;">MCP Tools</div>
    </div>
  </div>
</div>
</div>
<div class="tc" style="display:none;padding:12px;background:rgba(15,22,41,0.5);border-radius:8px;">
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
  <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:16px;text-align:center;">
    <div style="color:#ef4444;font-size:32px;font-weight:bold;">36</div>
    <div style="color:#8b95a5;font-size:13px;margin-top:4px;">Pages</div>
    <div style="color:#666;font-size:11px;">EC2, Lambda, ECS, EKS, S3, RDS, VPC...</div>
  </div>
  <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:16px;text-align:center;">
    <div style="color:#ef4444;font-size:32px;font-weight:bold;">13</div>
    <div style="color:#8b95a5;font-size:13px;margin-top:4px;">API Routes</div>
    <div style="color:#666;font-size:11px;">AI, Steampipe, CloudWatch, Cost...</div>
  </div>
  <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:16px;text-align:center;">
    <div style="color:#ef4444;font-size:32px;font-weight:bold;">6</div>
    <div style="color:#8b95a5;font-size:13px;margin-top:4px;">AI Agents</div>
    <div style="color:#666;font-size:11px;">EKS, DB, MSK, Idle, Trace, Incident</div>
  </div>
</div>
</div>
:::

:::notes
{timing: 3min}
AWSops는 3개 레이어로 구성됩니다.

{cue: pause}
Data Layer에서는 Steampipe가 AWS 380개 이상, Kubernetes 60개 이상의 테이블을 SQL로 조회합니다. AWS CLI보다 660배 빠릅니다.

AI Engine에서는 Bedrock Claude가 8개의 전문 MCP Gateway를 통해 125개의 도구를 사용합니다. 네트워크, 컨테이너, 보안, 비용 등 영역별 전문가 에이전트가 있습니다.

Dashboard는 Next.js 14로 만든 36개 페이지와 13개 API 라우트, 그리고 6개의 자동 수집 AI 에이전트로 구성됩니다.

{cue: transition}
구체적인 숫자를 보겠습니다.
:::

---

<!-- Slide 5: By the Numbers -->

@type: content

# AWSops v1.7.0 — By the Numbers

| 항목 | 수치 | 설명 |
|------|------|------|
| **Pages** | 36 | 컴퓨팅, 네트워크, 스토리지, 보안, 비용, K8s |
| **AI Routes** | 18 | 자연어 질문 → 자동 라우팅 → 전문 에이전트 |
| **MCP Tools** | 125 | 8 Gateway × 19 Lambda |
| **Auto-Collect Agents** | 6 | EKS/DB/MSK 최적화, 유휴 리소스, 트레이스, 사고 분석 |
| **SQL Query Files** | 25 | Steampipe 기반 실시간 인벤토리 |
| **Deploy Scripts** | 12 | CDK + 자동화 — 30분 내 배포 완료 |

:::notes
{timing: 2min}
숫자로 보면 더 명확합니다.

36개 페이지가 AWS의 모든 주요 서비스를 커버합니다. EC2, Lambda, ECS, EKS, RDS, ElastiCache, MSK, OpenSearch, S3, EBS, VPC, CloudFront, WAF, IAM, CloudWatch, CloudTrail, Cost Explorer까지.

AI 라우트가 18개라는 것은, 사용자가 자연어로 질문하면 자동으로 가장 적합한 에이전트로 라우팅된다는 의미입니다. "EKS 비용 최적화해줘"라고 하면 eks-optimize 에이전트가, "장애 원인 분석해줘"라고 하면 incident 에이전트가 자동으로 선택됩니다.

{cue: transition}
이게 어떤 가치를 만드는지 보겠습니다.
:::

---

<!-- Slide 6: Value Proposition -->

@type: content
@transition: slide

# AWSops가 주는 가치

::: left

### For DevOps / SRE

- **Console Hopping 제거** — 한 화면에서 모든 리소스
- **자연어 트러블슈팅** — "VPC Flow Log 분석해줘"
- **실시간 인시던트 분석** — Prometheus + Loki + Tempo + CloudWatch 교차 분석
- K9s 스타일 **터미널 UI** 포함

:::

::: right

### For FinOps / Management

- **자동 비용 최적화** — EKS/RDS/MSK rightsizing
- **유휴 리소스 스캔** — 미사용 EBS, EIP, 중지된 EC2
- **종합진단 리포트** — DOCX / MD / PDF 자동 생성 (15 섹션, 6 Pillar)
- **CIS 컴플라이언스** — v1.5 ~ v4.0 자동 벤치마크

:::

:::notes
{timing: 3min}
두 가지 관점에서 가치를 드립니다.

DevOps나 SRE 분들에게는 콘솔 호핑 없이 한 화면에서 모든 리소스를 보고, AI에게 자연어로 질문하면 됩니다. "이 EC2 인스턴스가 왜 느려?"라고 물으면 CloudWatch 메트릭을 확인하고, 네트워크 경로를 분석하고, 관련 로그를 찾아줍니다.

{cue: pause}

FinOps나 Management 분들에게는 자동으로 비용 최적화 기회를 찾아주고, 종합진단 리포트를 DOCX/MD/PDF로 뽑아줍니다. Well-Architected 6 Pillar 기반 15개 섹션을 Opus 모델이 분석해서 보고서를 만들어줍니다. 수작업 2-3일이 10분으로 줄어듭니다.

{cue: transition}
가장 중요한 차별점을 하나만 꼽자면...
:::

---

<!-- Slide 7: Key Differentiator -->

@type: content
@transition: fade

# 핵심 차별점: Zero SaaS Dependency

:::html
<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 32px;">
  <div style="background: rgba(0,212,255,0.1); border: 1px solid rgba(0,212,255,0.3); border-radius: 12px; padding: 24px; text-align: center;">
    <div style="font-size: 48px; margin-bottom: 12px;">🏠</div>
    <div style="color: #00d4ff; font-weight: bold; font-size: 18px; margin-bottom: 8px;">고객 VPC 내 실행</div>
    <div style="color: #8b95a5; font-size: 14px;">EC2 + CloudFront<br>데이터가 밖으로 나가지 않음</div>
  </div>
  <div style="background: rgba(0,255,136,0.1); border: 1px solid rgba(0,255,136,0.3); border-radius: 12px; padding: 24px; text-align: center;">
    <div style="font-size: 48px; margin-bottom: 12px;">🧠</div>
    <div style="color: #00ff88; font-weight: bold; font-size: 18px; margin-bottom: 8px;">Bedrock 기반 AI</div>
    <div style="color: #8b95a5; font-size: 14px;">AgentCore + MCP Gateway<br>외부 AI SaaS 불필요</div>
  </div>
  <div style="background: rgba(168,85,247,0.1); border: 1px solid rgba(168,85,247,0.3); border-radius: 12px; padding: 24px; text-align: center;">
    <div style="font-size: 48px; margin-bottom: 12px;">📊</div>
    <div style="color: #a855f7; font-weight: bold; font-size: 18px; margin-bottom: 8px;">Steampipe SQL</div>
    <div style="color: #8b95a5; font-size: 14px;">380+ 테이블, 660x 빠른<br>CLI 대비 성능</div>
  </div>
</div>
:::

:::notes
{timing: 3min}
가장 중요한 차별점은 Zero SaaS Dependency입니다.

AWSops는 고객의 VPC 안에서 실행됩니다. 모든 데이터가 고객 AWS 계정 안에 머물고, 외부 SaaS로 나가지 않습니다. 금융, 공공, 의료 등 데이터 주권이 중요한 환경에서도 사용할 수 있습니다.

AI도 Bedrock 기반입니다. OpenAI API나 다른 외부 AI 서비스를 사용하지 않고, 고객 계정의 Bedrock에서 Claude 모델을 직접 호출합니다. AgentCore Runtime과 MCP Gateway로 125개의 도구를 안전하게 실행합니다.

데이터 레이어는 Steampipe입니다. AWS CLI를 직접 실행하는 것보다 660배 빠르게 SQL로 AWS 리소스를 조회합니다. 380개 이상의 테이블을 PostgreSQL 프로토콜로 쿼리합니다.

{cue: question}
Datadog이나 Grafana Cloud 같은 외부 모니터링 SaaS 비용 때문에 고민하셨던 분 계시죠? AWSops는 그 비용 자체가 없습니다.

{cue: transition}
이제 아키텍처를 자세히 살펴보겠습니다.
:::

---

<!-- Slide 8: Block 1 Key Takeaways -->

@type: content
@transition: fade

# Key Takeaways — Why AWSops

- **Console Hopping 문제** → 36 페이지 Single Pane of Glass
- **데이터 사일로** → Steampipe + Prometheus + Loki + Tempo 통합
- **반복 수작업** → 6개 AI 자동 수집 에이전트
- **보고서 부담** → 종합진단 DOCX / MD / PDF 자동 생성 (6 Pillar, 15 섹션)
- **핵심 차별점** → Zero SaaS, 고객 VPC 내 실행, Bedrock AI

:::notes
{timing: 2min}
첫 번째 파트를 정리하겠습니다.

AWSops는 클라우드 운영의 4대 도전 과제를 동시에 해결합니다.
콘솔 호핑 대신 한 화면, 데이터 사일로 대신 통합 데이터소스, 수작업 대신 AI 에이전트, 수동 보고서 대신 자동 종합진단.

그리고 가장 중요한 것은 고객 VPC 안에서 100% 동작한다는 것입니다.

{cue: transition}
5분 쉬고 아키텍처를 자세히 보겠습니다.
:::
