// scripts/v2/backfill-owner-sub.mjs
// Step 2 of the ownership-key termination procedure (ADR-009 Amendment).
//
// Rows written before the sub cut-over hold `requested_by = <email>`. Because email is MUTABLE and
// can be REASSIGNED, matching ownership on it means a new holder of a departed user's address can
// read that user's legacy rows. `matchesIdentity()` therefore still accepts the email form, gated on
// LEGACY_EMAIL_OWNER_MATCH — and that flag cannot be turned off until these rows carry the
// immutable Cognito sub instead. This script drives that rewrite in TWO explicit steps.
//
//   node scripts/v2/backfill-owner-sub.mjs                       # PLAN only: writes the plan, changes nothing
//   node scripts/v2/backfill-owner-sub.mjs --apply <plan.json>    # APPLY exactly the entries in that plan
//
// WHY TWO STEPS, AND WHY NOTHING IS INFERRED
//
// The mapping this needs is "which sub owned this address WHEN THE ROW WAS WRITTEN". Cognito cannot
// answer that. An earlier revision of this script tried to approximate it by comparing each row
// group's oldest created_at against the mapped user's `UserCreateDate` — but UserCreateDate is when
// the ACCOUNT was created, not when it acquired the address. The most common reassignment is an
// existing, long-lived account taking over a departed colleague's address, and that sails straight
// through such a check: the account predates the rows, so the guard approves moving the victim's
// worker_jobs / diagnosis_reports / compliance_runs onto the new holder's sub, and then prints
// "Safe to deploy" (PR #195 review CRITICAL). A reversible READ exposure would have become an
// IRREVERSIBLE ownership transfer, which is the opposite of this script's stated contract.
//
// So it does not guess. It emits a plan with the evidence it has, and an operator decides. Deleting
// an entry from the plan is how you refuse it. Only entries present in the approved plan are applied,
// and each is re-verified at apply time against BOTH the database (the rows still hold the planned
// old value) and Cognito (the address still resolves to the planned sub, with a verified email).
// Verifying only the database was the earlier gap: the plan records an operator's approval of
// specific ROWS, not a standing guarantee about the IDENTITY behind an address.
//
// A second refusal, added after review (codex stop-gate): only users whose Cognito `email_verified`
// is "true" are eligible at all. verifyUser() already refuses to honour an unverified email claim on
// READ; trusting one here would undo that in the irreversible direction, since the rewrite moves the
// rows onto that sub permanently and sub-keyed rows are fully trusted afterwards. Guarding only the
// reversible path is not a guard.
//
// After a clean apply (every legacy row rewritten, nothing left pending), deploy with
// LEGACY_EMAIL_OWNER_MATCH=false — step 3.

import { execSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import pg from 'pg';

const REGION = process.env.AWS_REGION || 'ap-northeast-2';
const ROOT = new URL('../..', import.meta.url).pathname;
// Both artifacts carry the FULL email -> Cognito sub mapping plus the affected row ids, so they are
// gitignored AND written 0600 (PR #203 review, 3 models). The .gitignore patterns key off this
// prefix, so an operator-supplied PLAN_PATH must keep it — otherwise a differently-named plan is
// committable, which is exactly what the gitignore was for.
// Must line up with the .gitignore patterns EXACTLY. Two holes, both found in review (3 models):
//   (1) the old check accepted any `backfill-owner-sub*` basename, which is broader than the ignore
//       globs — `backfill-owner-sub-review.json` passed and was still committable;
//   (2) `--apply <path>` was not checked at all, and the journal path derives from it, so
//       `--apply approved.json` wrote `approved-applied.json`: the full email->sub mapping plus row
//       ids, untracked by any ignore rule. The comment claiming "the gitignore pattern keys off this
//       prefix" was guarding exactly one of the two paths that produce these files.
const ARTIFACT_PREFIX = 'backfill-owner-sub';
/** True only for basenames the .gitignore rules actually cover. */
function isIgnoredArtifactName(p) {
  const b = basename(p);
  return b.startsWith(`${ARTIFACT_PREFIX}-`) && b.endsWith('.json');
}
function requireIgnoredArtifactName(p, what) {
  if (!isIgnoredArtifactName(p)) {
    die(`${what} must be named "${ARTIFACT_PREFIX}-<something>.json" — it carries every user's `
      + `email->sub mapping and the affected row ids, and .gitignore only covers that shape, so any `
      + `other name is committable. Got: ${p}`);
  }
}
// Argument parsing comes FIRST: the guards below read APPLY_FROM, and when the two calls sat above
// this block the `const` was still in its temporal dead zone, so every invocation — plan and apply
// alike — died with a ReferenceError before doing anything (PR #203 review CRITICAL, 7 cells).
const applyIdx = process.argv.indexOf('--apply');
const APPLY_FROM = applyIdx >= 0 ? process.argv[applyIdx + 1] : null;
if (applyIdx >= 0 && !APPLY_FROM) die('--apply needs a plan file path');

const PLAN_PATH = process.env.PLAN_PATH || `${ARTIFACT_PREFIX}-plan.json`;
requireIgnoredArtifactName(PLAN_PATH, 'PLAN_PATH');
if (APPLY_FROM) requireIgnoredArtifactName(APPLY_FROM, 'the --apply plan path');

// Every column that carries an ownership key. Keep in sync with matchesIdentity()'s callers.
const TARGETS = [
  { table: 'worker_jobs', column: 'requested_by', pk: 'job_id' },
  { table: 'diagnosis_reports', column: 'requested_by', pk: 'id' },
  { table: 'compliance_runs', column: 'requested_by', pk: 'id' },
  // report_schedules.user_sub is NOT always a sub: the round-2 pentest fix stored identity() there
  // (email-preferring), so pre-cut-over schedules hold an email despite the column name — see
  // scripts/v2/workers/test_schedule_dispatcher.py. Leaving it out made the completion check
  // ("0 residual legacy rows -> step 3 is safe") false: the dispatcher passes user_sub straight
  // through as requested_by, so those schedules keep MINTING new email-keyed reports after the
  // backfill, their owner loses them at flag-off, and readSchedule(sub) cannot see the row, so a user
  // who re-creates a schedule ends up with two enabled rows and the diagnosis runs twice
  // (PR #203 review MAJOR, 2 models independently, L2+L4).
  { table: 'report_schedules', column: 'user_sub', pk: 'id' },
];

// report_schedules has UNIQUE (user_sub, schedule_type), so rewriting email->sub collides whenever the
// same person already has a sub-keyed schedule of that type — exactly the double-schedule case above.
// The UPDATE would raise 23505 and roll the whole apply back (fail-closed, but unfinishable), so the
// plan finds these first and leaves them out: which of the two schedules is authoritative is a
// decision, not something this tool can infer.
// Both rows' `enabled` come back, because that is what decides how bad the leftover is: two enabled
// rows means the diagnosis already runs twice; only the legacy one enabled means the person's real
// schedule is still email-keyed and its output goes invisible at flag-off. Reporting just one flag
// would leave the operator guessing which case they are in.
// Two ways a rewrite can land badly, so both are checked here:
//   same type  -> UNIQUE (user_sub, schedule_type) makes the UPDATE impossible (23505).
//   any type, both enabled -> allowed by the constraint but it breaks the app's invariant. base
//     web/lib/diagnosis-schedule.ts upsertSchedule() disables every OTHER frequency for a user
//     precisely so exactly one schedule is ever active; transferring a legacy weekly (enabled) onto a
//     sub that already has an enabled monthly leaves two active rows, so the dispatcher (WHERE
//     enabled) fires both — a doubled diagnosis and doubled Bedrock spend — while readSchedule()'s
//     LIMIT 1 hides one of them in the UI. No constraint fires, so nothing rolls back
//     (PR #203 review MAJOR).
async function scheduleConflicts(client, ids, from, to) {
  const { rows } = await client.query(
    `SELECT l.id::text AS id, l.schedule_type, l.enabled AS legacy_enabled,
            s.id::text AS other_id, s.enabled AS other_enabled, s.schedule_type AS other_type,
            (s.schedule_type = l.schedule_type) AS same_type
       FROM report_schedules l
       JOIN report_schedules s ON s.user_sub = $3
        AND (s.schedule_type = l.schedule_type OR (s.enabled AND l.enabled))
      WHERE l.id::text = ANY($1::text[]) AND l.user_sub = $2`,
    [ids, from, to]);
  return rows;
}

// The schedule_type of each planned row, needed to spot two PLANNED rewrites claiming the same
// (sub, type). Cognito lowercases nothing on our behalf: the DB may hold `X@e.io` and `x@e.io` as two
// distinct owner values that map to the SAME single user, and if both have a weekly schedule the second
// UPDATE violates UNIQUE (user_sub, schedule_type). The old check only looked at rows ALREADY holding
// the sub, so both entered the plan, the apply rolled back, and re-planning reproduced it forever —
// the backfill could never finish (review P2).
async function scheduleTypes(client, ids, from) {
  const { rows } = await client.query(
    `SELECT id::text AS id, schedule_type, enabled
       FROM report_schedules WHERE id::text = ANY($1::text[]) AND user_sub = $2`,
    [ids, from]);
  return new Map(rows.map((r) => [r.id, r]));
}

function die(m) { console.error(`backfill-owner-sub: ${m}`); process.exit(1); }

// Every value interpolated into the hand-recovery SQL this script PRINTS goes through here. An email
// may legitimately contain an apostrophe (o'connor@example.com), which made the printed statement
// invalid SQL — and a value chosen to close the quote could change what a copied statement does
// (review P2). Doubling the quote is the standard escape; standard_conforming_strings is on in PG
// (default since 9.1) so backslashes are literal and need no handling.
function lit(v) { return `'${String(v).replace(/'/g, "''")}'`; }

// True only when the account provably existed before the oldest row it would inherit. Missing or
// unparseable timestamps are NOT ok: see the plan-side gate.
function ageOk(accountCreated, rowsWritten) {
  const oldest = String(rowsWritten ?? '').split(' .. ')[0];
  const a = accountCreated ? new Date(accountCreated) : null;
  const r = oldest ? new Date(oldest) : null;
  if (!a || !r || Number.isNaN(+a) || Number.isNaN(+r)) return false;
  return a <= r;
}
const tf = (out) => execSync(`terraform -chdir=terraform/v2/foundation output -raw ${out}`,
  { cwd: ROOT, encoding: 'utf8' }).trim();

function loadCreds() {
  const cfg = JSON.parse(execSync(
    `aws secretsmanager get-secret-value --region ${REGION} --secret-id ${tf('aurora_secret_arn')}` +
    ' --query SecretString --output text', { cwd: ROOT, encoding: 'utf8' }));
  return {
    host: tf('aurora_endpoint'), user: cfg.username, password: cfg.password,
    database: 'awsops', port: 5432, ssl: { rejectUnauthorized: false },
  };
}

/** email (lowercased) -> { sub, accountCreated, verified } for every user in the pool.
 *
 * Unverified addresses are deliberately excluded, which makes them show up as unmapped rather than
 * as a rewrite target (codex stop-gate). This is the same rule verifyUser() applies to the token
 * claim, and skipping it here would have undone that fix in the worst possible direction: the read
 * gate refuses to honour an unverified email, but a rewrite keyed off one moves the victim's rows
 * onto that sub PERMANENTLY — and rows owned by sub are fully trusted afterwards. A control that
 * only guards the reversible path while the irreversible path stays open is not a control.
 */
function cognitoUsersByEmail() {
  const poolId = tf('cognito_user_pool_id');
  const map = new Map();
  // Paginate. A truncated map would report real users as "no such address" — fail-safe but
  // misleading, since the operator would read it as "this person is gone".
  let token = null;
  do {
    const out = execSync(
      `aws cognito-idp list-users --region ${REGION} --user-pool-id ${poolId} --max-items 60` +
      (token ? ` --starting-token ${token}` : '') +
      " --query '{u: Users[].{a: Attributes, c: UserCreateDate}, t: NextToken}' --output json",
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 32e6 });
    const page = JSON.parse(out);
    for (const u of page.u || []) {
      const byName = Object.fromEntries((u.a || []).map((a) => [a.Name, a.Value]));
      // `email_verified` arrives as the STRING "true" from Cognito's attribute list, not a boolean.
      // Unverified holders are recorded with verified:false rather than dropped, so the plan can say
      // WHY an address is unmappable — "exists but unverified" needs different handling from "no such
      // user", and conflating them tells an operator a live colleague is gone (review MINOR, 2 models;
      // the ADR already promised the distinction). Eligibility is checked at the use site.
      if (byName.email && byName.sub) {
        const key = byName.email.toLowerCase();
        // Two users whose addresses differ only in case collapse to one key. The pool does not pin
        // username_configuration, so this is possible, and `map.set` silently kept whichever page came
        // last — an arbitrary, irreversible ownership transfer decided by pagination order, from a tool
        // whose contract is "infer nothing" (PR #203 review MAJOR, 2 models). Record the collision
        // instead; the use sites refuse the address outright.
        const prev = map.get(key);
        if (prev && prev.sub !== byName.sub) {
          map.set(key, { ...prev, ambiguous: [...(prev.ambiguous || [prev.sub]), byName.sub] });
        } else if (!prev) {
          map.set(key, {
            sub: byName.sub,
            accountCreated: u.c || null,
            verified: byName.email_verified === 'true',
          });
        }
      }
    }
    token = page.t || null;
  } while (token);
  return map;
}

/** Every legacy email-keyed row group, with the row ids so a plan entry is exact. */
async function scan(client) {
  const groups = [];
  for (const { table, column, pk } of TARGETS) {
    const { rows } = await client.query(
      `SELECT ${column} AS owner, count(*)::int AS n, min(created_at) AS oldest,
              max(created_at) AS newest, array_agg(${pk}::text ORDER BY ${pk}) AS ids
         FROM ${table} WHERE ${column} LIKE '%@%' GROUP BY ${column}`);
    for (const r of rows) groups.push({ table, column, pk, ...r });
  }
  return groups;
}

async function plan(client) {
  // Scan FIRST. Dying on an empty pool before looking at the data meant a fresh or empty user pool
  // could not report the clean "nothing to migrate" result even when there were zero legacy rows
  // (review MINOR) — the refusal only matters when there is something to map.
  const groups = await scan(client);
  if (groups.length === 0) {
    console.log('No legacy email-keyed rows. Nothing to do — safe to deploy with LEGACY_EMAIL_OWNER_MATCH=false.');
    return;
  }

  const users = cognitoUsersByEmail();
  if (users.size === 0) {
    die('there are legacy email-keyed rows but Cognito returned no users at all — '
      + 'refusing to write a plan (every entry would be unmappable)');
  }
  // The map deliberately keeps unverified users so plan() can report them as a distinct cause, so the
  // total is NOT a verified count — say what it actually is (PR #203 review MINOR).
  const verifiedCount = [...users.values()].filter((u) => u.verified).length;
  console.log(`pool: ${users.size} Cognito users (${verifiedCount} with a verified email)`);

  const entries = [];
  const unmapped = [];    // no such user
  const unverified = [];  // user exists, email not verified — NOT a rewrite target
  const ambiguous = [];   // >1 user maps to the same lowercased address — refuse, don't guess
  const tooYoung = [];    // the account postdates the rows — it cannot have written them
  const conflicts = [];   // report_schedules: the sub already has a schedule of that type
  const planClashes = [];       // two PLANNED rewrites claim the same (sub, schedule_type)
  const claimedSchedules = new Map(); // `${sub}\0${type}` -> the entry that claimed it first
  const claimedActive = new Map();    // sub -> the entry that already claims an ENABLED schedule
  for (const g of groups) {
    const hit = users.get(String(g.owner).toLowerCase());
    if (!hit) { unmapped.push(g); continue; }
    if (hit.ambiguous) { ambiguous.push({ ...g, subs: hit.ambiguous }); continue; }
    if (!hit.verified) { unverified.push(g); continue; }
    // Account-age gate, fail-closed. This was only "evidence" for the operator to weigh, but for the one
    // case we can actually decide it is decisive: if the Cognito account was created AFTER the oldest row
    // written under its address, that account did not write those rows — the address was acquired later,
    // which is exactly the reassigned-mailbox takeover this PR exists to stop (codex stop-gate: signup
    // being blocked now does nothing about accounts that already exist). Refuse instead of asking.
    // Fail-closed on missing data too: if either timestamp is absent we cannot establish that this
    // account predates the rows, and "cannot tell" must not read as "fine" in a gate whose whole job is
    // to stop an irreversible transfer.
    const acctAge = hit.accountCreated ? new Date(hit.accountCreated) : null;
    const rowAge = g.oldest ? new Date(g.oldest) : null;
    if (!acctAge || !rowAge || Number.isNaN(+acctAge) || Number.isNaN(+rowAge) || acctAge > rowAge) {
      tooYoung.push({ ...g, accountCreated: hit.accountCreated, sub: hit.sub,
        undecidable: !acctAge || !rowAge || Number.isNaN(+acctAge) || Number.isNaN(+rowAge) });
      continue;
    }
    let ids = g.ids;
    if (g.table === 'report_schedules') {
      const clash = await scheduleConflicts(client, g.ids, g.owner, hit.sub);
      if (clash.length > 0) {
        conflicts.push({ ...g, clash, to: hit.sub });
        ids = g.ids.filter((id) => !clash.some((c) => c.id === id));
      }
      // Then the intra-plan collisions: whoever claimed (sub, type) first keeps it, the rest are
      // reported. First-wins is arbitrary but stable, and both sides are named in the output.
      if (ids.length > 0) {
        const types = await scheduleTypes(client, ids, g.owner);
        const keep = [];
        for (const id of ids) {
          const row = types.get(id);
          if (!row) { keep.push(id); continue; }
          const key = `${hit.sub}\u0000${row.schedule_type}`;
          // Same (sub, type) is a hard UNIQUE collision; a second ENABLED row of ANY type under the
          // same sub breaks the one-active-schedule invariant instead (see scheduleConflicts). Both
          // are plan-level clashes between two rows this very plan would move.
          const prior = claimedSchedules.get(key)
            || (row.enabled ? claimedActive.get(hit.sub) : null);
          if (prior) {
            planClashes.push({ ...g, to: hit.sub, id, schedule_type: row.schedule_type, prior,
              sameType: claimedSchedules.has(key) });
            continue;
          }
          claimedSchedules.set(key, { owner: g.owner, id, schedule_type: row.schedule_type });
          if (row.enabled) claimedActive.set(hit.sub, { owner: g.owner, id, schedule_type: row.schedule_type });
          keep.push(id);
        }
        ids = keep;
      }
      if (ids.length === 0) continue;
    }
    entries.push({
      table: g.table, column: g.column, pk: g.pk,
      from: g.owner, to: hit.sub, rows: ids.length, ids,
      evidence: {
        rowsWritten: `${g.oldest} .. ${g.newest}`,
        currentHolderAccountCreated: hit.accountCreated,
        // The account is at least as old as the oldest row (entries that fail that are excluded), so
        // what remains unknowable is whether the address changed hands BETWEEN accounts of similar age.
        note: 'This account predates the oldest row above, so it existed when they were written — but Cognito does not record WHEN the address was acquired. Confirm this sub held it for the whole window, then keep this entry; delete it to refuse.',
      },
    });
  }

  // NEVER overwrite an existing plan. Deleting an entry is how an operator REFUSES it, so the plan file
  // is the only record of those refusals — and it was written to a fixed path with an unconditional
  // overwrite. A second `make backfill-owner-sub` (this repo warns that concurrent sessions are normal)
  // replaced a reviewed plan with a fresh one in which every refused entry is back, and `--apply` would
  // then rewrite them: its automatic re-checks cover DB and Cognito state, not the operator's judgement
  // (PR #203 review MAJOR). The journal already defended exactly this with wx + a counting suffix; the
  // plan being the unprotected one was the asymmetry.
  const planPath = (() => {
    const base = PLAN_PATH.replace(/\.json$/, '');
    let p = `${base}.json`;
    for (let i = 2; existsSync(p); i += 1) p = `${base}-${i}.json`;
    return p;
  })();
  writeFileSync(planPath, JSON.stringify({ generated: 'plan', entries }, null, 2),
    { mode: 0o600, flag: 'wx' });
  chmodSync(planPath, 0o600); // see the journal writer: `mode` alone does not tighten an existing file
  if (planPath !== PLAN_PATH) {
    console.log(`\nNOTE: ${PLAN_PATH} already exists and was NOT touched — this plan went to a new file.`);
    console.log('If you reviewed the earlier one, apply THAT path; if you meant to re-plan, delete the old');
    console.log('file first so there is no doubt which set of entries you approved.');
  }
  console.log(`\nplan written: ${planPath} (${entries.length} entries, ${entries.reduce((a, e) => a + e.rows, 0)} rows) — NOTHING CHANGED`);
  console.log('Review every entry. Delete the ones you cannot vouch for, then:');
  console.log(`  node scripts/v2/backfill-owner-sub.mjs --apply ${planPath}`);
  console.log('');
  console.log('QUIESCE THE SCHEDULE DISPATCHER FIRST. It claims report_schedules rows, holds the owner');
  console.log('value in memory, and inserts diagnosis_reports/worker_jobs afterwards — so a call that is');
  console.log('in flight during the apply can write a NEW email-keyed row AFTER the final "0 legacy rows');
  console.log('left" check, and flipping the flag then hides that row from its owner. It runs hourly, so');
  console.log('the window is narrow but real:');
  console.log('  aws events disable-rule --name awsops-v2-schedule-dispatcher   # stops NEW invocations');
  console.log('  # disable-rule does NOT stop an invocation that is already running (codex stop-gate).');
  console.log('  # Its timeout is 120s, so wait past that AND confirm nothing is in flight before you');
  console.log('  # apply — Invocations over the last 5 min must be 0:');
  console.log('  sleep 150');
  console.log('  aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name Invocations \\');
  console.log('    --dimensions Name=FunctionName,Value=awsops-v2-schedule-dispatcher \\');
  console.log('    --start-time "$(date -u -d \'-5 min\' +%FT%TZ)" --end-time "$(date -u +%FT%TZ)" \\');
  console.log('    --period 300 --statistics Sum');
  console.log('  aws events enable-rule --name awsops-v2-schedule-dispatcher    # after, once clean');
  // Two causes, reported separately because they need different handling — and because telling an
  // operator a live colleague is "gone" would be wrong.
  if (unverified.length > 0) {
    console.log(`\nNOT IN THE PLAN — the address exists in the pool but is NOT VERIFIED:`);
    for (const g of unverified) console.log(`  ${g.owner}  (${g.table}, ${g.n} rows)`);
    console.log('An unverified address proves nothing about who controls that mailbox, and the');
    console.log('rewrite is irreversible. Verify it (or correct the holder) and re-plan.');
  }
  if (unmapped.length > 0) {
    console.log(`\nNOT IN THE PLAN — no user holds these addresses at all (deleted?):`);
    for (const g of unmapped) console.log(`  ${g.owner}  (${g.table}, ${g.n} rows)`);
    console.log('Nothing here can recover the owner. Find the original sub by hand, or retire the');
    console.log('rows.');
  }
  if (ambiguous.length > 0) {
    console.log('\nNOT IN THE PLAN — more than one Cognito user maps to this address (case-only difference):');
    for (const g of ambiguous) console.log(`  ${g.owner}  (${g.table}, ${g.n} rows) -> ${g.subs.join(' | ')}`);
    console.log('Picking one would be a guess, and the rewrite is irreversible. Resolve the duplicate');
    console.log('accounts in the pool first.');
  }
  if (conflicts.length > 0) {
    console.log('\nNOT IN THE PLAN — the target sub already has a schedule that collides:');
    for (const g of conflicts) {
      for (const c of g.clash) {
        // Four cases, not three: both-disabled fell through to the sub-keyed-only branch and was
        // reported as "the sub-keyed row is enabled" when nothing was (stop-gate). Each case states
        // what IS, and stops there — `enabled = false` says nothing is running right now, not that a
        // row is disposable: both rows still carry schedule_type/config a user can re-enable, and
        // this tool's contract is to infer nothing about intent (second stop-gate on the same lines).
        const why = c.legacy_enabled && c.other_enabled
          ? (c.same_type
            ? 'BOTH ENABLED — this diagnosis is ALREADY running twice'
            : 'BOTH ENABLED on different frequencies — the app keeps exactly one schedule active per '
              + 'user (upsertSchedule disables the others), so moving this row onto that sub would '
              + 'leave two firing and hide one in the UI')
          : c.legacy_enabled
            ? 'only the legacy row is enabled — this person\'s live schedule is still email-keyed, and '
              + 'at flag-off its reports become invisible to them'
            : c.other_enabled
              ? 'only the sub-keyed row is enabled — the legacy row is not firing, and the live schedule '
                + 'is already sub-keyed; the legacy row\'s config is still there if it was the one they meant'
              : 'NEITHER is enabled — nothing is firing, so this one is not urgent; both rows still hold '
                + 'a config that can be re-enabled, so which survives is still a decision';
        console.log(`  legacy id=${c.id} (${g.owner}, type=${c.schedule_type}, enabled=${c.legacy_enabled})`
          + ` vs id=${c.other_id} (${g.to}, type=${c.other_type}, enabled=${c.other_enabled})`
          + `${c.same_type ? '  [same type — UNIQUE would reject the rewrite]' : '  [different type — both would be ACTIVE]'}`);
        console.log(`    -> ${why}`);
      }
    }
    console.log('Same type: UNIQUE (user_sub, schedule_type) makes the rewrite impossible. Different type');
    console.log('with both enabled: the constraint allows it, but the app keeps one active schedule per');
    console.log('user, so the result would be two firing at once. Either way the merge is a decision this');
    console.log('tool will not make. Note that leaving it alone is NOT neutral:');
    console.log('the dispatcher runs every enabled row regardless of the flag, so an enabled legacy row');
    console.log('keeps firing and keeps writing email-keyed reports. Compare the two configs, keep the');
    console.log('one that reflects what the user wants, remove the other, then re-plan. The address\'s');
    console.log('other rows ARE in the plan.');
  }
  if (planClashes.length > 0) {
    console.log('\nNOT IN THE PLAN — two legacy addresses would be rewritten onto the SAME schedule slot:');
    for (const c of planClashes) {
      console.log(`  report_schedules id=${c.id} ${c.owner} -> ${c.to} type=${c.schedule_type}`
        + `  (${c.sameType ? 'same slot' : 'an ENABLED schedule'} already claimed by ${c.prior.owner},`
        + ` id=${c.prior.id}, type=${c.prior.schedule_type})`);
    }
    console.log('These addresses differ only in letter case, so they are the same Cognito user, but the');
    console.log('DB kept them as separate owner values. UNIQUE (user_sub, schedule_type) allows only one');
    console.log('to survive, and planning both would abort the whole apply on every attempt. Merge or');
    console.log('delete the duplicate schedule rows first, then re-plan.');
  }
  if (tooYoung.length > 0) {
    console.log('\nNOT IN THE PLAN — the Cognito account is NEWER than the rows it would inherit:');
    for (const g of tooYoung) {
      console.log(`  ${g.owner}  (${g.table}, ${g.n} rows written ${g.oldest} .. ${g.newest})`);
      console.log(g.undecidable
        ? `    account ${g.sub} — cannot establish its age (created=${g.accountCreated ?? 'unknown'},`
          + ` oldest row=${g.oldest ?? 'unknown'}), so the check cannot pass`
        : `    account ${g.sub} created ${g.accountCreated} — after the oldest row, so it did not write them`);
    }
    console.log('That is the reassigned-mailbox case: someone holds the address now, but a different');
    console.log('person wrote those rows. Rewriting would hand their data over irreversibly. If the');
    console.log('account was legitimately re-created for the SAME person, move the rows by hand.');
  }
  if (unverified.length > 0 || unmapped.length > 0 || ambiguous.length > 0 || conflicts.length > 0
      || planClashes.length > 0 || tooYoung.length > 0) {
    console.log('\nKeep LEGACY_EMAIL_OWNER_MATCH=true until these are resolved.');
  }
  process.exitCode = 2;   // a plan is not a completed migration
}

async function apply(client) {
  const parsed = JSON.parse(readFileSync(APPLY_FROM, 'utf8'));
  const entries = parsed.entries || [];
  if (entries.length === 0) die(`${APPLY_FROM} has no entries`);

  // RE-CHECK COGNITO HERE, not just in plan() (codex stop-gate). The verified-email gate lived only
  // in cognitoUsersByEmail(), which plan() calls — apply() trusted the plan file's from→to pairing
  // outright. A plan written before that gate existed, or one whose addresses changed or lost
  // verification in between, would have been applied anyway. The plan is an operator's *approval*
  // of specific rows; it is not evidence that the identity behind an address is still the same one,
  // and this is the step that cannot be undone.
  const users = cognitoUsersByEmail();
  if (users.size === 0) die('Cognito returned no users — refusing to apply');
  const rejected = [];
  for (const e of entries) {
    const hit = users.get(String(e.from).toLowerCase());
    if (!hit) {
      rejected.push(`${e.from} -> ${e.to}: no user holds this address now`);
    } else if (hit.ambiguous) {
      rejected.push(`${e.from} -> ${e.to}: ${hit.ambiguous.length} users now map to this address `
        + `(${hit.ambiguous.join(', ')}) — refusing to guess`);
    } else if (!hit.verified) {
      rejected.push(`${e.from} -> ${e.to}: the address is no longer VERIFIED on ${hit.sub}`);
    } else if (!ageOk(hit.accountCreated, e.evidence?.rowsWritten)) {
      rejected.push(`${e.from} -> ${e.to}: cannot establish that the account holding this address `
        + `(created ${hit.accountCreated ?? 'unknown'}) predates the oldest row it would inherit `
        + `(${String(e.evidence?.rowsWritten ?? 'unknown').split(' .. ')[0]}) — re-plan`);
    } else if (hit.sub !== e.to) {
      rejected.push(`${e.from} -> ${e.to}: address now belongs to ${hit.sub}, not the planned sub`);
    }
  }
  if (rejected.length > 0) {
    console.error('\nREFUSING TO APPLY — the plan no longer matches Cognito:');
    for (const r of rejected) console.error(`  ${r}`);
    die('re-run the plan step and review the new plan; an ownership rewrite is not reversible');
  }

  // Journal BEFORE writing, per row id — an UPDATE erases the old value, so a journal written only
  // afterwards cannot tell you what to put back (PR #195 review MAJOR: the previous journal was
  // row-nonspecific and written after the fact). It carries an explicit `status` because the write is
  // now transactional: a file named "-applied" that was left behind by a rolled-back run would be a
  // lie, and the reverse ordering (journal after COMMIT) loses the record if the process dies between
  // the two. Stamping the outcome covers both.
  // One journal PER RUN, never reused. The path used to be a pure function of the plan name, so a
  // second `--apply` with the same plan overwrote the first run's journal — and its very first act is
  // journal('attempting'), which strips changedIds. A committed run's reversal record was therefore
  // destroyed by the next run before that run had written anything (PR #203 review MAJOR). The suffix
  // counts up until an unused name is found and the first write is exclusive (`wx`), so an existing
  // journal can never be clobbered even if two operators run at once.
  const journalBase = `${APPLY_FROM.replace(/\.json$/, '')}-applied`;
  let journalPath = `${journalBase}.json`;
  for (let i = 2; existsSync(journalPath); i += 1) journalPath = `${journalBase}-${i}.json`;
  // `entries` gains a `changedIds` per entry once the UPDATEs run — that, not the planned `ids`, is
  // the reversal scope (they differ when a row moved on since the plan). A `rolled-back` journal has
  // them stripped, since nothing was changed.
  // chmod after the write, not just `mode:` — `mode` applies only when the file is CREATED, so
  // re-running over a file that already existed with looser bits kept the PII world-readable
  // (PR #203 review MINOR, 3 model families).
  let journalCreated = false;
  const journal = (status) => {
    const body = JSON.stringify({ startedFrom: APPLY_FROM, status, entries }, null, 2);
    // `wx` on the first write: if something created that name in the meantime, fail rather than
    // overwrite someone else's record. Later writes (the outcome stamp) target the file we made.
    writeFileSync(journalPath, body, journalCreated ? { mode: 0o600 } : { mode: 0o600, flag: 'wx' });
    journalCreated = true;
    chmodSync(journalPath, 0o600);
  };
  journal('attempting');
  console.log(`journal (pre-write, row-specific): ${journalPath}`);

  // ONE TRANSACTION for every entry. The previous revision ran each UPDATE on its own — each
  // autocommitted — so a failure (or a `die()`) partway through left the earlier entries applied:
  // a partially-rewritten ownership table, which the commit message claimed was exactly what this
  // avoids (codex stop-gate). Table/column validation moves ahead of BEGIN so a malformed plan
  // never opens a transaction at all.
  for (const e of entries) {
    if (!TARGETS.some((t) => t.table === e.table && t.column === e.column && t.pk === e.pk)) {
      die(`plan entry targets an unknown table/column: ${e.table}.${e.column}`);
    }
  }

  let total = 0;
  let committed = false;
  let commitSent = false;
  const applied = [];
  // Default isolation (READ COMMITTED) on purpose. SERIALIZABLE was tried here for the
  // one-active-schedule check and measured WORSE on PG 17: its snapshot hides a concurrent commit, so
  // the check passes and both transactions land two enabled rows, where READ COMMITTED sees the commit
  // and aborts. The invariant is enforced by the partial unique index uq_schedule_one_active
  // (migration 01KZ3C7Q…) instead — the one layer that sees both transactions regardless of isolation.
  // The check below stays as the path that produces a readable message when it CAN see the conflict.
  await client.query('BEGIN');
  try {
    for (const e of entries) {
      // Update exactly the planned rows: scoped to the ids AND still holding the planned old value,
      // so rows that changed since the plan are left alone.
      // RETURNING the pk so the journal records the rows this run ACTUALLY changed, not the rows it
      // planned to. The two differ whenever a row moved on since the plan (reported below as "left
      // alone"), and a reversal scoped to the PLANNED ids could then overwrite a row this run never
      // touched — one that happens to hold the same sub because something else set it (codex
      // stop-gate). The journal's whole job is to be a reversal record, so it has to hold the real set.
      const r = await client.query(
        `UPDATE ${e.table} SET ${e.column} = $1
          WHERE ${e.pk}::text = ANY($2::text[]) AND ${e.column} = $3
          RETURNING ${e.pk}::text AS __changed_id`,
        [e.to, e.ids, e.from]);
      e.changedIds = r.rows.map((row) => row.__changed_id);
      // A count mismatch means the world moved since the plan, and the ADR's contract is "any
      // mismatch -> write nothing". The previous revision only LOGGED "left alone" and committed the
      // rest, which is a partial apply against the operator's approved set — behaviourally
      // conservative, but not what the document promised, and for an irreversible ownership tool the
      // gap between the two is itself the defect (PR #203 review MAJOR, 3 models across 4 cells).
      // Throwing here rolls the whole transaction back; the operator re-plans against reality.
      if (e.changedIds.length !== e.ids.length) {
        const missing = e.ids.filter((id) => !e.changedIds.includes(id));
        throw new Error(
          `${e.table}.${e.column}: ${e.ids.length - e.changedIds.length} of ${e.ids.length} planned rows `
          + `no longer hold ${e.from} (${missing.slice(0, 5).join(', ')}`
          + `${missing.length > 5 ? `, +${missing.length - 5} more` : ''}) — the plan is stale`);
      }
      total += e.changedIds.length;
      applied.push(`${e.table}.${e.column}: ${e.from} -> ${e.to} (${e.changedIds.length} rows)`);
    }
    // The DB enforces (user_sub, schedule_type) itself, but nothing enforces "one ENABLED schedule per
    // user" — that invariant lives in upsertSchedule(). So a schedule created (or re-enabled) between
    // plan and apply would sail through the plan-time checks and leave two rows firing, with no
    // constraint violation to roll anything back (codex stop-gate). Assert it here, where it cannot be
    // bypassed: any target sub holding more than one enabled row aborts the whole apply.
    const touchedSubs = [...new Set(entries.filter((e) => e.table === 'report_schedules').map((e) => e.to))];
    if (touchedSubs.length > 0) {
      const { rows: dup } = await client.query(
        `SELECT user_sub, count(*)::int AS n, array_agg(id::text ORDER BY id) AS ids
           FROM report_schedules WHERE user_sub = ANY($1::text[]) AND enabled
          GROUP BY user_sub HAVING count(*) > 1`,
        [touchedSubs]);
      if (dup.length > 0) {
        throw new Error(
          'the rewrite would leave more than one ENABLED schedule per user, which makes the diagnosis '
          + 'run twice: '
          + dup.map((d) => `${d.user_sub} -> ${d.n} rows (${d.ids.join(', ')})`).join('; ')
          + ' — something changed since the plan; re-plan against reality');
      }
    }
    // Set immediately before COMMIT and nowhere earlier: this flag is what makes the catch report an
    // UNKNOWN outcome instead of a rollback, so anything that throws before the COMMIT is sent — the
    // stale-plan count check, the one-active-schedule check — must still be reported as "nothing was
    // written", because that is what happened (codex stop-gate).
    commitSent = true;
    await client.query('COMMIT');
    committed = true;
  } catch (err) {
    // A throw AFTER the COMMIT was sent does not mean the transaction rolled back: a lost response or
    // a dropped connection leaves the server's decision unknown to us, and it may well have committed.
    // Recording `rolled-back` there would put a false "nothing was rewritten" in the journal, whose
    // truthfulness is this tool's stated contract (PR #203 review MAJOR). Keep the changedIds — if it
    // did commit, they are the reversal scope — and make the operator resolve it by re-querying.
    if (commitSent) {
      try { journal('unknown'); } catch { /* the message below is the real signal */ }
      console.error('\nUNKNOWN OUTCOME — the COMMIT was sent but its result was not received:');
      console.error(`  ${err?.message || err}`);
      console.error(`  The journal (${journalPath}) is stamped "unknown" and still holds the row ids.`);
      console.error('  Re-query before doing anything: for each entry, count rows whose id is in');
      console.error('  changedIds and whose column still holds `from` (0 => it committed, all => it');
      console.error('  did not). Do NOT re-run --apply until you know which.');
      die('outcome unknown — verify against the database first');
    }
    // Past the commitSent branch the transaction is definitely still open and definitely not durable:
    // the failure happened before COMMIT was even sent (codex stop-gate: journal('committed') used to
    // sit inside the try, so a failing journal WRITE after a successful COMMIT rolled into this
    // handler and recorded `rolled-back` — telling the operator nothing changed when everything had).
    await client.query('ROLLBACK').catch(() => {});
    // Drop any changedIds collected before the failure: the transaction rolled back, so those rows
    // were NOT changed, and leaving them in a journal would read as a partial rewrite that happened.
    for (const e of entries) delete e.changedIds;
    try { journal('rolled-back'); } catch { /* the message below is the real signal */ }
    console.error('\nROLLED BACK — nothing was rewritten:');
    console.error(`  ${err?.message || err}`);
    if (err?.code === '23505' && String(err.constraint || '').includes('one_active')) {
      console.error('  (a schedule write landed on one of these users while this apply was running, and');
      console.error('   uq_schedule_one_active refused the second active row. Nothing was written —');
      console.error('   re-plan so the collision is reported, then re-run.)');
    }
    die('resolve the error and re-run --apply with the same plan; no rows were changed');
  }

  // Past this point the rewrite IS durable — the catch above always exits, so this line is only
  // reachable after COMMIT returned. Asserted rather than assumed: if a future edit adds an early
  // continue/return into the try, this fails loudly instead of writing a `committed` journal for a
  // transaction that never committed.
  if (!committed) die('internal: reached the post-commit path without a COMMIT — refusing to journal');

  // A journal failure here must not be reported as a rollback, and must not exit non-zero as though
  // the data were unchanged — losing the audit file is bad, but claiming the rewrite did not happen
  // is worse.
  try {
    journal('committed');
  } catch (err) {
    console.error(`\nCOMMITTED, but the journal could not be written: ${err?.message || err}`);
    console.error(`The rewrite IS applied. Record it by hand from the plan, which is still on disk:`);
    console.error(`  ${APPLY_FROM}`);
    console.error(`To reverse, scope to the rows this run ACTUALLY changed — never to the sub, and`);
    console.error(`never to the planned ids (some may have been left alone):`);
    for (const e of entries) {
      if (!e.changedIds?.length) {
        console.error(`  ${e.table}.${e.column}: ${e.from} -> ${e.to} — 0 rows changed, nothing to reverse`);
        continue;
      }
      console.error(`  UPDATE ${e.table} SET ${e.column} = ${lit(e.from)}`);
      console.error(`    WHERE ${e.pk}::text = ANY(ARRAY[${e.changedIds.map(lit).join(',')}])`);
      console.error(`      AND ${e.column} = ${lit(e.to)};`);
    }
    console.error(`(A bare "WHERE <column> = <sub>" would also revert rows that legitimately hold that`);
    console.error(` sub — every post-cut-over write, plus any other plan entry mapping a different`);
    console.error(` address to the same person. The planned ids are wrong too: a planned row that was`);
    console.error(` left alone may hold that sub for an unrelated reason. Only the changed ids are safe.)`);
  }
  for (const line of applied) console.log(line);
  console.log(`\nrewrote ${total} rows (one transaction, committed).`);
  console.log('If you disabled awsops-v2-schedule-dispatcher for this apply, re-enable it AFTER the');
  console.log('residual check below reads 0:  aws events enable-rule --name awsops-v2-schedule-dispatcher');

  // The remaining-rows check is a REPORT, not part of the rewrite. Letting it throw would reach
  // main()'s catch -> die() -> exit 1, which reads as "the apply failed" for a run that committed
  // (codex stop-gate: the same misreport class as the journal case above).
  let left;
  try {
    left = await scan(client);
  } catch (err) {
    console.error(`\nCOMMITTED. The remaining-rows check could not run: ${err?.message || err}`);
    console.error(`Re-run the plan step to see what is left; keep LEGACY_EMAIL_OWNER_MATCH=true until`);
    console.error(`you have confirmed no legacy email-keyed rows remain.`);
    process.exitCode = 2;   // not finished — but NOT "the rewrite failed"
    return;
  }
  if (left.length > 0) {
    console.log('\nLegacy email-keyed rows REMAIN:');
    for (const g of left) console.log(`  ${g.owner}  (${g.table}, ${g.n} rows)`);
    console.log('LEGACY_EMAIL_OWNER_MATCH must stay true.');
    process.exitCode = 2;
  } else {
    console.log('\nNo legacy email-keyed rows left. Safe to deploy with LEGACY_EMAIL_OWNER_MATCH=false (step 3).');
  }
}

async function main() {
  const client = new pg.Client({ ...loadCreds(), statement_timeout: 300_000 });
  await client.connect();
  try {
    if (APPLY_FROM) await apply(client);
    else await plan(client);
  } finally {
    await client.end();
  }
}

main().catch((e) => die(e?.message || String(e)));
