# Skill: Release

## When to Use
Prepare a new release of the AWSops Dashboard.

## Steps

### 1. Pre-Release Checks
```bash
# Build must pass
npm run build

# Full verification (46+ checks)
bash scripts/09-verify.sh

# All services running
bash scripts/07-start-all.sh
```

### 2. Version Update
- Update version in `src/components/layout/Sidebar.tsx` footer (currently v1.0.0)
- Update CLAUDE.md if architecture changed

### 3. Changelog
Document changes in commit messages or CHANGELOG.md:
- New pages added
- New query files
- API changes
- AgentCore/Gateway updates
- Bug fixes (especially query column fixes)

### 4. Deploy
```bash
# On EC2: rebuild and restart
bash scripts/03-build-deploy.sh

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id <ID> --paths "/awsops*"
```

### 5. Post-Deploy Verification
```bash
# Verify via CloudFront
curl -s -o /dev/null -w "%{http_code}" https://<cf-domain>/awsops

# Run full verify
bash scripts/09-verify.sh
```
