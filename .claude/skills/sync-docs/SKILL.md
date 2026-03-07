# Sync Docs Skill

Synchronize project documentation with current code state.

## Actions

### 1. Quality Assessment
Score each CLAUDE.md file (0-100) across:
- Commands/workflows (20 pts)
- Architecture clarity (20 pts)
- Non-obvious patterns (15 pts)
- Conciseness (15 pts)
- Currency (15 pts)
- Actionability (15 pts)

Output quality report with grades (A-F) before making changes.

### 2. Root CLAUDE.md Sync
- Update Overview, Architecture, Critical Rules, Key Files
- Verify commands are copy-paste ready against actual scripts
- Update "Adding New Pages" if the workflow has changed

### 3. Architecture Doc Sync
- Update `docs/architecture.md` to reflect current system structure
- Cross-reference with `scripts/ARCHITECTURE.md` for consistency
- Add new components, update data flows, reflect infrastructure changes

### 4. Module CLAUDE.md Audit
- Scan `src/app/`, `src/components/`, `src/lib/`, `src/types/`
- Create CLAUDE.md for modules missing one
- Update existing module CLAUDE.md files if out of date
- Score each module CLAUDE.md

### 5. ADR Audit
- Check recent commits: `git log --oneline -20`
- Review existing ADRs in `docs/decisions/`
- Suggest new ADRs for undocumented architectural decisions

### 6. README.md Sync
- Update project structure section to match actual directory layout

### 7. Report
Output before/after quality scores and list of all changes.

## Usage
Run with `/sync-docs` command
