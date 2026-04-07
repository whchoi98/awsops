# Run Full Test Suite

Execute the complete AWSops validation pipeline.

## Steps

1. **Lint check**: Run `npx next lint` and report any ESLint errors
2. **Type check**: Run `npx tsc --noEmit` and report any TypeScript errors
3. **Build check**: Run `npm run build` and verify it succeeds
4. **Hook tests**: Run `bash tests/run-all.sh` if tests directory exists
5. **CLAUDE.md sync**: Check all `src/` subdirectories have a `CLAUDE.md`
6. **ADR count**: Verify `docs/decisions/` has at least one ADR

Report a summary table:

| Check | Status | Details |
|-------|--------|---------|
| Lint | PASS/FAIL | ... |
| Types | PASS/FAIL | ... |
| Build | PASS/FAIL | ... |
| Hooks | PASS/FAIL | ... |
| Docs | PASS/FAIL | ... |
