# Build and Deploy

Build the AWSops dashboard for production and deploy via SSM.

## Steps

1. **Pre-flight checks**:
   - Verify no TypeScript errors: `npx tsc --noEmit`
   - Verify no lint errors: `npx next lint`

2. **Production build**:
   - Run `npm run build`
   - Verify `.next/` output exists

3. **Deploy** (requires user confirmation):
   - Stop the running service: `sudo systemctl stop awsops`
   - Start the service: `sudo systemctl start awsops`
   - Verify status: `sudo systemctl status awsops`
   - Health check: `curl -s http://localhost:3000/awsops/ | head -5`

4. **Post-deploy**:
   - Verify cache warmer starts (check logs for `[CacheWarmer]`)
   - Report deployment status

## Important
- Always ask for user confirmation before restarting the service
- If build fails, do NOT proceed to deploy
- Check `scripts/03-build-deploy.sh` for the canonical deploy process
