---
name: install
description: Guided AWSops v2 installation — fresh install, v1-to-v2 migration, or remove-v1-then-reinstall. Scenario selection, prerequisite checks, configure TUI, terraform plan/apply, first deploy, data backfill, domain cutover
triggers: install, 설치, setup, 셋업, provision, 프로비저닝, migrate from v1, v1 마이그레이션, v2 전환
---

# 스킬: 설치 / Skill: Install (AWSops v2)

**단일 소스 워크플로우는 [docs/guides/install-v2-guided.md](../../../docs/guides/install-v2-guided.md)** — 이 파일을 읽고 0단계(시나리오 선택: 신규 설치 / v1→v2 마이그레이션 / v1 제거 후 신규 설치)부터 순서대로 따른다. Kiro 사용자는 동일 내용을 `.kiro/steering/install-v2.md`로 쓴다 — 두 진입점 모두 이 가이드 하나를 가리키므로 **워크플로우 수정은 가이드에서만** 한다.

Read [docs/guides/install-v2-guided.md](../../../docs/guides/install-v2-guided.md) — the single-source workflow — and follow it from Step 0 (scenario selection). Edit the guide, never this pointer, when the workflow changes.

## Claude Code 전용 지침 / Claude-specific notes

- 0단계 시나리오 선택과 각 승인 게이트는 **AskUserQuestion**으로 묻는다.
- `make configure`(대화형 TUI)는 사용자가 직접 실행해야 한다 — `! make configure` 입력을 안내한다.
- 긴 apply/deploy는 `run_in_background`로 돌리고 완료 알림으로 이어간다.
