---
name: release
description: Prepare a new release with build, verify, changelog, and git tag
triggers: release, version, tag
---

# 스킬: 릴리스 / Skill: Release

## 사용 시점 / When to Use
AWSops 대시보드의 새 릴리스를 준비합니다.
(Prepare a new release of the AWSops Dashboard.)

## 단계 / Steps

### 1. 릴리스 전 점검 / Pre-Release Checks
```bash
# 빌드 통과 필수 (Build must pass)
npm run build

# 전체 검증 — 46개 이상 점검 (Full verification — 46+ checks)
bash scripts/11-verify.sh

# 전체 서비스 실행 확인 (All services running)
bash scripts/09-start-all.sh
```

### 2. 버전 업데이트 / Version Update
- `src/components/layout/Sidebar.tsx` 푸터의 버전 업데이트 — 현재 v1.0.0 (Update version in `src/components/layout/Sidebar.tsx` footer — currently v1.0.0)
- 아키텍처 변경 시 CLAUDE.md 업데이트 (Update CLAUDE.md if architecture changed)

### 3. 변경 이력 / Changelog
커밋 메시지 또는 CHANGELOG.md에 변경 사항을 기록합니다:
(Document changes in commit messages or CHANGELOG.md:)
- 새 페이지 추가 (New pages added)
- 새 쿼리 파일 (New query files)
- API 변경 (API changes)
- AgentCore/Gateway 업데이트 (AgentCore/Gateway updates)
- 버그 수정, 특히 쿼리 컬럼 수정 (Bug fixes, especially query column fixes)

### 4. 배포 / Deploy
```bash
# EC2에서: 재빌드 및 재시작 (On EC2: rebuild and restart)
bash scripts/03-build-deploy.sh

# CloudFront 캐시 무효화 (Invalidate CloudFront cache)
aws cloudfront create-invalidation --distribution-id <ID> --paths "/awsops*"
```

### 5. 배포 후 검증 / Post-Deploy Verification
```bash
# CloudFront를 통해 검증 (Verify via CloudFront)
curl -s -o /dev/null -w "%{http_code}" https://<cf-domain>/awsops

# 전체 검증 실행 (Run full verify)
bash scripts/11-verify.sh
```
