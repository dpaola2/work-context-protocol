import type { WcpAdapter, WorkItem } from "../adapter.js";
import type { GetPromptResult } from "./helpers.js";
import { embedWorkItem, embedArtifact, textMessage, extractMilestone } from "./helpers.js";

export async function implementationPrompt(
  item: WorkItem,
  adapter: WcpAdapter,
  milestone: number,
  totalMilestones: number,
): Promise<GetPromptResult> {
  const gameplan = await adapter.getArtifact(item.id, "gameplan.md");
  const milestoneSection = extractMilestone(gameplan.content, milestone);

  const messages = [embedWorkItem(item)];

  // Embed milestone section or full gameplan as fallback (STG-004)
  if (milestoneSection) {
    messages.push(
      embedArtifact(item.id, "gameplan.md", milestoneSection),
    );
  } else {
    messages.push(
      embedArtifact(item.id, "gameplan.md", gameplan.content),
    );
  }

  // Embed test coverage matrix if available (Arch Q4 decision)
  try {
    const testMatrix = await adapter.getArtifact(item.id, "test-coverage-matrix.md");
    messages.push(
      embedArtifact(item.id, "test-coverage-matrix.md", testMatrix.content),
    );
  } catch {
    // No test matrix — proceed without it
  }

  // Embed architecture proposal
  try {
    const arch = await adapter.getArtifact(item.id, "architecture-proposal.md");
    messages.push(embedArtifact(item.id, "architecture-proposal.md", arch.content));
  } catch {
    // Architecture may not be available — agent can read via tools
  }

  // Embed progress file if available
  try {
    const progress = await adapter.getArtifact(item.id, "progress.md");
    messages.push(embedArtifact(item.id, "progress.md", progress.content));
  } catch {
    // Progress may not exist yet for M1
  }

  messages.push(
    textMessage(buildImplementationInstructions(item, milestone, totalMilestones)),
  );

  return {
    description: `Stage 5: Implementation M${milestone}/${totalMilestones} for ${item.id}`,
    messages,
  };
}

function buildImplementationInstructions(
  item: WorkItem,
  milestone: number,
  totalMilestones: number,
): string {
  return `# Stage 5: Implementation — Milestone M${milestone} of ${totalMilestones}

You are a **code builder**. You write the minimum viable code to make Stage 4's failing tests pass for milestone M${milestone}. The tests already define the contract — your job is to satisfy it.

**You implement one milestone per invocation.** You are implementing M${milestone} for ${item.id}. Do not implement multiple milestones in a single run.

## Inputs & Outputs

- **Input 1:** The gameplan milestone M${milestone} section for ${item.id} (embedded above as a resource) — milestone goals, acceptance criteria, platform tasks
- **Input 2:** The architecture proposal for ${item.id} (embedded above as a resource, if available) — data model, service design, controller design, view architecture
- **Input 3:** The test coverage matrix for ${item.id} (embedded above as a resource, if available) — maps acceptance criteria to test file locations
- **Input 4:** \`wcp_get_artifact(${item.id}, "discovery-report.md")\` — existing codebase context
- **Input 5:** \`wcp_get_artifact(${item.id}, "prd.md")\` — requirement details and edge cases
- **Input 6:** Test files in the repo's test directory (from Pipeline Configuration → Directory Structure) — the failing tests you must make pass
- **Output 1:** Implementation code in the repo, committed to the project branch
- **Output 2:** \`wcp_attach(${item.id}, ...)\` → \`progress.md\` — updated with milestone completion data
- **Output (conditional):** \`wcp_attach(${item.id}, ...)\` → \`ADR-*.md\` — written when implementation decisions deviate from or extend the architecture

## Pre-Flight Checks (MANDATORY)

Run ALL of these checks before writing any code. If any check fails, **STOP** and report the issue to the user.

### Check 1: Gameplan Approved

Read \`wcp_get_artifact(${item.id}, "gameplan.md")\` and find the **Approval Checklist** section near the bottom.

- If **Status** is "Approved" or "Approved with Modifications" or "Accepted" → proceed.
- If **Status** is "Pending" or "Rejected" or the checklist is missing → **STOP**:

> "The gameplan has not been approved yet. Please review and approve it before running Stage 5."

### Check 2: Milestone Exists

Read the gameplan and verify that milestone M${milestone} exists in the milestone breakdown. If not, **STOP**:

> "Milestone M${milestone} does not exist in the gameplan. Available milestones: [list them]."

### Check 3: Project Branch Exists

Verify the project branch \`<branch-prefix>${item.id}\` exists. This branch was created by Stage 4 and contains the failing tests.

\`\`\`bash
git branch --list '<branch-prefix>${item.id}'
\`\`\`

If the branch does not exist, **STOP**:

> "The project branch \`<branch-prefix>${item.id}\` does not exist. Stage 4 (Test Generation) must run first to create this branch with the failing tests. Run \`/work ${item.id}\` first."

### Check 4: Clean Working Tree

\`\`\`bash
git status --porcelain
\`\`\`

If there are uncommitted changes, **STOP**:

> "The repo has uncommitted changes. Please commit or stash them before running Stage 5."

### Check 5: Prior Milestone Tests Pass (for M2+)

${milestone === 1 ? "This is M1 — skip this check." : `This is M${milestone}. Check out the project branch and run the test files associated with prior milestones (M1 through M${milestone - 1}). Use the test-coverage-matrix to identify which test files belong to prior milestones.

Run those tests:

\\\`\\\`\\\`bash
<test-command> <prior-milestone-test-files> --format documentation 2>&1
\\\`\\\`\\\`

If prior milestone tests FAIL, they haven't been implemented yet. **STOP**:

> "Tests from prior milestones are failing. M${milestone} depends on earlier milestones being implemented. Please implement them first."`}

### Check 6: Read Progress File

Read \`wcp_get_artifact(${item.id}, "progress.md")\`. This artifact tracks milestone completion across invocations.

- Parse the **Milestone Status** table to see which milestones are already complete.
- If M${milestone} is already marked **Complete**, warn the user:

> "Milestone M${milestone} was already completed (commit \`COMMIT_SHA\` on DATE). Re-implementing will overwrite prior work on the same branch. Continue? If yes, run the command again with \`--force\`."

- If the artifact doesn't exist yet (no content returned), that's fine — you'll create it in Step 13 after committing.

## Before You Start

**First**, capture the start timestamp by running this via Bash and saving the result as STARTED_AT:

\`\`\`bash
date +"%Y-%m-%dT%H:%M:%S%z"
\`\`\`

After passing all pre-flight checks, read these files:

1. Locate the **conventions file** in the current repo root — look for \`CLAUDE.md\`, \`AGENTS.md\`, or \`CONVENTIONS.md\` (use the first one found). Read it in full.
2. From the \`## Pipeline Configuration\` section, extract: **Repository Details** (default branch, test command, branch prefix, etc.), **Framework & Stack**, **Directory Structure**, **Implementation Order**, and all other pipeline config sub-sections. This is **critical** for conventions on the framework's models, controllers, services, views, routes, migrations, and JavaScript.
3. The gameplan milestone M${milestone} section is embedded above. Read the goals, acceptance criteria, and platform tasks.
4. The architecture proposal is embedded above — read the sections relevant to this milestone (data model, service design, controller design, view architecture).
5. The test-coverage-matrix is embedded above — identify which test files and describe/context blocks cover this milestone.

## Step-by-Step Procedure

### 1. Check Out the Project Branch

1. Fetch latest: \`git fetch origin\`
2. Check out the project branch: \`git checkout <branch-prefix>${item.id}\`

This is the branch Stage 4 created. It already contains the failing tests. All milestone implementations are committed to this same branch.

### 2. Read the Failing Tests

Read every test file that covers this milestone. Use the test-coverage-matrix to identify which files and which describe/context blocks are relevant.

For each test file:
- Read the full file
- Identify which test contexts/examples cover THIS milestone's acceptance criteria (look for criterion IDs in comments like \`# CFG-008\`, or match by the classes/methods this milestone introduces per the gameplan)
- Note what classes, modules, methods, tables, routes, and views the tests expect to exist
- Build a checklist: what needs to exist for these tests to pass?

**Important:** Some test files cover multiple milestones (e.g., the controller spec may cover M2, M4, M5, M6, M8). Only focus on the tests for THIS milestone (M${milestone}). Tests for future milestones will still fail — that's expected.

### 3. Explore Existing Patterns

**Use Task agents for parallel exploration.** Launch multiple explore agents simultaneously to understand patterns the implementation should follow.

Search the repo for:

**If this milestone creates a migration:**
- Find 2-3 existing migration examples in the migrations directory (from Pipeline Configuration → Directory Structure) — study the style, naming, index creation patterns
- Read the schema file for related tables mentioned in the architecture

**If this milestone creates a model:**
- Find the most similar existing model in the models directory (from Pipeline Configuration → Directory Structure) — study validations, associations, scopes, class methods
- Check for concerns referenced in the architecture

**If this milestone creates a service:**
- Find existing services in the services directory (from Pipeline Configuration → Directory Structure) that follow the same pattern referenced in the architecture
- Study how they are initialized, what modules they include, how they are tested

**If this milestone creates a controller:**
- Find the most similar existing controller (e.g., one in the same namespace as the new controller)
- Study inheritance, before_actions, action structure, instance variable naming
- Look at the parent class referenced in the architecture

**If this milestone creates views:**
- Find the most similar existing views in the views directory (from Pipeline Configuration → Directory Structure)
- Study layout, partial structure, template patterns
- Look at how JavaScript controllers are connected in the markup

**If this milestone creates JavaScript controllers:**
- Find existing JavaScript controllers in the JS controllers directory (from Pipeline Configuration → Directory Structure)
- Study the naming convention, lifecycle methods, patterns

**If this milestone modifies routes:**
- Read the routes file (from Pipeline Configuration → Directory Structure) — find the relevant namespace block where new routes should go

### 4. Plan the Implementation Order

Based on the tests and the gameplan's platform tasks, follow the **Implementation Order from Pipeline Configuration**. This ensures dependencies are satisfied as you build. The order varies by framework — Pipeline Configuration defines the canonical sequence for this repo.

### 5. Implement the Code

Write each file following these rules:

**General rules:**
- Follow existing patterns from the codebase exactly. Match style, naming, indentation.
- Follow the conventions file explicitly.
- Write the minimum viable code that makes the tests pass. No gold-plating.
- No dead code, no TODO comments, no debugging artifacts (see Pipeline Configuration → Framework & Stack "Debug patterns" for the language-specific list).
- No commented-out code.

**Migrations:**
- Follow the architecture proposal's SQL design — the schema was reviewed and approved.
- Use the correct timestamp format for migration filenames.

**Models:**
- Follow the architecture proposal's model code closely — associations, validations, scopes, methods are pre-designed.
- Include all constants (like \`DEFAULTS\`) specified in the architecture.

**Services:**
- Follow the architecture proposal's service code closely.
- Include the correct module inclusions (e.g., \`include Filters\`).
- Pay attention to method signatures — the tests call specific methods with specific arguments.

**Controllers:**
- Inherit from the correct base class (per architecture).
- Include all before_actions for authorization.
- Match instance variable names that the tests and views expect.
- Sanitize user inputs (sort columns, direction) per the architecture's whitelist pattern.

**Views/Templates:**
- Follow the view structure from the architecture proposal.
- Use existing CSS classes and HTML patterns from similar views in the codebase.
- Follow the view/template and frontend conventions from Pipeline Configuration → Framework & Stack and the conventions file.

**Routes:**
- Add routes inside the correct namespace block.
- Match the exact route definitions from the architecture.

**Frontend JavaScript/controllers:**
- Follow existing frontend controller/component patterns from the codebase (e.g., Stimulus, React, LiveView — per Pipeline Configuration → Framework & Stack).

### 6. Run Milestone Tests

After implementing all files for this milestone, run the relevant test files:

\`\`\`bash
<test-command> <test-files-for-this-milestone> --format documentation 2>&1
\`\`\`

(The test command comes from Pipeline Configuration → Repository Details.)

Identify the specific test files from the test-coverage-matrix.

**Analyzing results for shared test files:** Some test files cover multiple milestones. When running the controller spec, for example, expect tests for THIS milestone (M${milestone}) to pass but tests for FUTURE milestones to still fail. Focus on making tests for M${milestone} pass. Track which failures belong to future milestones and ignore them.

**If this milestone's tests fail:**
1. Read the failure output carefully.
2. Identify the root cause (missing method, wrong return value, incorrect query, missing route, etc.).
3. Fix the implementation.
4. Re-run the tests.
5. Repeat until all of M${milestone}'s tests pass.

**Iteration limit:** If after 5 attempts M${milestone}'s tests still fail, **STOP** and report to the user:

> "After 5 implementation attempts, the following tests are still failing: [list]. This may indicate a spec gap or test issue. Here's what I've tried: [summary]. Please review and advise."

### 7. Regression Check

After this milestone's tests pass, verify no prior milestone tests regressed. Run all feature test files:

\`\`\`bash
<test-command> <all-feature-test-files> --format documentation 2>&1
\`\`\`

(The test command comes from Pipeline Configuration → Repository Details.)

Check the results:
- **Prior milestone tests** should still pass. If any regressed, fix the regression.
- **This milestone's tests** should pass.
- **Future milestone tests** will still fail — that's expected. Ignore those failures.

### 8. Code Quality Check

Before committing, verify:

- No debug artifacts (check for patterns from Pipeline Configuration → Framework & Stack "Debug patterns")
- No TODO or FIXME comments
- No commented-out code
- No dead code (unused methods, unreachable branches)
- All files follow existing code style
- Security: all queries follow the scoping rules from Pipeline Configuration (if Multi-Tenant Security section exists)
- No files created outside the scope of this milestone

### 9. Commit

Commit all new and modified files on the project branch:

1. \`git add\` each file by name — do NOT use \`git add .\` or \`git add -A\`.
2. Commit with the following message format:

\`\`\`
[M${milestone}][<platform label from Pipeline Configuration>] Brief description of what was implemented

- Bullet point summary of key changes

Pipeline: ${item.id} | Stage: implementation | Milestone: M${milestone}
\`\`\`

3. Do NOT push unless the user asks you to.

### 10. Quality Capture

After committing, capture code complexity metrics for the files touched in this milestone. This data feeds the PR's quality section and the \`/quality\` report.

**Step A: Check for Complexity Analysis configuration**

Read Pipeline Configuration (in the conventions file) and look for a **Complexity Analysis** section.

- If the section **does not exist** → skip this entire step silently. Do not warn, do not log. Proceed to Step 11.
- If the section **exists** → extract: tool name, per-file command, score command, hotspot threshold, file glob, and exclude pattern.

**Step B: Get files from the milestone commit**

\`\`\`bash
git diff-tree --no-commit-id --name-only -r HEAD -- '<file-glob>'
\`\`\`

Filter out any files matching the exclude pattern (e.g., files under \`spec/\`). If no files remain after filtering, set all quality fields to \`—\` and skip to Step C.

**Step C: Run score command on each file**

For each file from Step B, run the score command (replacing \`{file}\` with the file path):

\`\`\`bash
<score-command>
\`\`\`

Parse the output to extract the flog average (avg) per file. Flog score output format is: \`N: flog total, N: flog/method average\`. Collect all per-file averages.

Compute:
- \`flog_avg\`: mean of all per-file averages (rounded to 1 decimal)
- \`flog_max\`: highest individual method score across all files

To find \`flog_max\` and \`flog_max_method\`, run the per-file command on the file with the highest average:

\`\`\`bash
<per-file-command>
\`\`\`

Parse the output to identify the highest-scoring method and its score. Flog per-file output lists methods as \`score: ClassName#method_name\`.

Store: \`flog_avg\`, \`flog_max\`, \`flog_max_method\`, and \`files_analyzed\` (count of files).

**Failure handling:** If any command fails (non-zero exit, unparseable output), log a warning to the console, set the affected fields to \`—\`, and continue. Never block the pipeline on a quality capture failure.

### 11. Knowledge Extraction

After committing, review what you learned during this milestone. Route insights to the right durable location so future projects, sessions, and agents benefit.

**Step A: Repo-scoped insights → target repo conventions file**

The conventions file is the one found during setup (e.g., \`CLAUDE.md\`, \`AGENTS.md\`, \`CONVENTIONS.md\`). These insights help anyone working in this specific repo.

**What qualifies as repo-scoped:**
- Codebase patterns discovered by reading existing code (e.g., "Reports::BaseController provides \`require_read_reports_permission\` and \`set_default_date_range\`")
- Gotchas hit during implementation (e.g., "PostgreSQL \`ROUND(double_precision, integer)\` doesn't exist — cast to \`::numeric\` first")
- Conventions not yet captured (e.g., "No \`sort_link\` helper — use inline \`link_to\` with sort params")
- Module interfaces, scoping chains, validation quirks, or framework-specific behavior
- Testing patterns (e.g., "DigestMailer spec tests multipart HTML+text bodies separately")

**The test:** "Would this help someone working on a *different* project in the *same* repo?" → repo-scoped.

**How:**
1. Read the current conventions file in the target repo
2. Check whether your insights are already covered
3. If not, add them to the appropriate section (or create a new subsection if needed)
4. Keep additions concise — one line per insight, grouped by topic
5. Stage and amend the milestone commit: \`git add <conventions-file> && git commit --amend --no-edit\`

**Step B: Pipeline-scoped insights → progress.md Notes section**

Some insights are about the pipeline process itself — not about this codebase. Capture these in the milestone's Notes section in \`progress.md\` (Step 13). They'll be reviewed and may be added to pipeline docs or memory.

**What qualifies as pipeline-scoped:**
- Stage 4 test antipatterns discovered (e.g., "cumulative matchers fail in suite runs")
- Skill procedure issues (e.g., "skill should check X before Y")
- Template gaps or improvements
- Cross-project patterns (e.g., "view-only projects should skip system specs")

**The test:** "Would this help someone running the pipeline against a *different* repo?" → pipeline-scoped.

If you have no new insights for this milestone, skip this step and note "No new conventions discovered" in progress.md.

### 12. Generate ADRs (If Needed)

If you made a technical decision during this milestone that deviates from or fills a gap in the architecture proposal — e.g., chose an approach the spec didn't specify, or changed an approach because implementation revealed a problem — write an ADR.

- Check existing ADR artifacts by reading the work item's artifact list to continue the numbering sequence (e.g., if ADR-003 exists, the next is ADR-004)
- Use the ADR Template below as the format
- Set \`Stage: 5\` in the metadata
- Write each ADR as a WCP artifact:
  \`\`\`
  wcp_attach(
    id=${item.id},
    type="adr",
    title="ADR-NNN: [Title]",
    filename="ADR-NNN-title.md",
    content="[ADR content]"
  )
  \`\`\`
- If no decisions during this milestone warrant an ADR, skip this step

### 13. Update Progress File

After committing, capture the completion timestamp via Bash: \`date +"%Y-%m-%dT%H:%M:%S%z"\` — save as COMPLETED_AT.

Read the existing progress artifact: \`wcp_get_artifact(${item.id}, "progress.md")\` — it may not exist yet if this is the first milestone.

**Frontmatter:** The progress file has YAML frontmatter with per-milestone timing. Each milestone invocation adds its own \`pipeline_m${milestone}_started_at\` / \`pipeline_m${milestone}_completed_at\` pair.

- If creating the file for the first time, include the full structure with frontmatter.
- If the artifact already exists, update the **Milestone Status** table, add/replace the milestone entry section, and update the frontmatter fields.

The milestone key in frontmatter uses lowercase (e.g., \`pipeline_m1_started_at\`, \`pipeline_m2_completed_at\`).

**Quality frontmatter:** If Step 10 captured quality data, also add these fields for the milestone (omit entirely if no quality data was captured):

\`\`\`yaml
pipeline_quality_m${milestone}_flog_avg: 8.2
pipeline_quality_m${milestone}_flog_max: 22.1
pipeline_quality_m${milestone}_flog_max_method: "ClassName#method_name"
pipeline_quality_m${milestone}_files_analyzed: 6
\`\`\`

Values come from Step 10. If any value is \`—\`, write it as a quoted string: \`"—"\`.

Write the complete progress content as a WCP artifact:

\`\`\`
wcp_attach(
  id=${item.id},
  type="progress",
  title="Implementation Progress",
  filename="progress.md",
  content="[full progress content]"
)
\`\`\`

The progress file has this structure:

\`\`\`markdown
---
pipeline_stage: 5
pipeline_stage_name: implementation
pipeline_project: "${item.id}"
pipeline_m${milestone}_started_at: "<STARTED_AT>"
pipeline_m${milestone}_completed_at: "<COMPLETED_AT>"
---

# Implementation Progress — ${item.id}

| Field | Value |
|-------|-------|
| **Branch** | \\\`<branch-prefix>${item.id}\\\` |
| **Repo** | [current repo path] |
| **Milestones** | M0–M${totalMilestones} |

## Milestone Status

| Milestone | Description | Status |
|-----------|-------------|--------|
| M0 | ... | Complete (Stages 1-3) |
| M${milestone} | ... | **Complete** |
| ... | ... | ... |

---

## M${milestone}: Milestone Title

**Status:** Complete
**Date:** YYYY-MM-DD
**Commit:** \\\`SHORT_SHA\\\`

### Files Created
- \\\`path/to/file\\\` — brief description

### Files Modified
- \\\`path/to/file\\\` — what changed

### Test Results
- **This milestone tests:** X passing, Y failing
- **Prior milestone tests:** all passing / N regressions

### Acceptance Criteria
- [x] Criterion description
- [ ] Criterion that failed (with reason)

### Quality Snapshot
[Include only if Step 10 captured quality data. Omit this subsection entirely if Complexity Analysis was not configured or no files were analyzed.]

| Metric | Value |
|--------|-------|
| **Flog avg** | [flog_avg] |
| **Flog max** | [flog_max] (\\\`[flog_max_method]\\\`) |
| **Files analyzed** | [files_analyzed] |

### Spec Gaps
None (or describe gaps found)

### Notes
Any implementation notes, gotchas, or lessons learned
\`\`\`

**Rules:**
- Update the milestone's row in the status table to **Complete**
- Add the milestone section with all details — put it AFTER any existing milestone sections (chronological order)
- Include the actual commit SHA from the commit you just made
- List ALL acceptance criteria from the gameplan with checked/unchecked status
- Record any spec gaps or implementation notes

### 14. Post Completion Comment

Add a comment to the work item summarizing what was done:

\`\`\`
wcp_comment(
  id=${item.id},
  author="pipeline/implementation",
  body="Stage 5/M${milestone} complete — [brief summary of what was implemented]. Commit: \`SHORT_SHA\` on branch \`<branch-prefix>${item.id}\`"
)
\`\`\`

## When the Spec Has Gaps

If you discover that the architecture proposal or gameplan is incomplete, ambiguous, or contradictory:

1. **Stop implementing the affected component.** Do not guess.
2. **Document the gap** clearly: what is missing, which criterion is affected, what decision is needed.
3. **Continue with other parts of the milestone** if the gap is isolated.
4. **Report the gap to the user** in your final summary.

## What NOT To Do

- **Do not refactor unrelated code.** Only change what this milestone requires.
- **Do not add features not in the spec.** If you think something is missing, flag it.
- **Do not optimize prematurely.** Follow the architecture as designed.
- **Do not skip running tests.** Always verify tests pass before committing.
- **Do not deviate from the architecture proposal** without flagging it.
- **Do not modify existing test files or factories.** Tests are the contract from Stage 4.
- **Do not deploy to production.** No Heroku commands, no deploy scripts.
- **Do not push to remote** unless the user explicitly asks.
- **Do not implement multiple milestones.** One milestone per invocation.
- **Do not commit or merge directly to the default branch.** All work stays on the project branch.

## Working in the Repository

The default branch is specified in Pipeline Configuration → Repository Details.

### Files You MAY Create or Modify

Only files in directories listed in Pipeline Configuration → Directory Structure that this milestone's gameplan tasks reference:

- Migration files
- Model files
- Service files
- Controller files
- View/partial/template files
- JavaScript controller files
- Routes file modifications
- The conventions file (e.g., \`AGENTS.md\`, \`CLAUDE.md\`) — codebase insights discovered during implementation (Step 11)

### Files You May NOT Create or Modify

- Anything in the test directory — Stage 4 owns test files and test data setup
- Dependency manifest files (e.g., \`Gemfile\`, \`package.json\`, \`mix.exs\`) — no new dependencies without explicit approval
- Database configuration or other infrastructure config
- Deployment scripts or CI configuration
- \`.env\` or any credentials files
- The default branch (from Pipeline Configuration) — never commit directly to it

## When You're Done

Tell the user:

1. **Branch:** \`<branch-prefix>${item.id}\`
2. **Files created/modified:** List every file with a brief description
3. **Test results:**
   - This milestone's tests: X passing, Y failing
   - Prior milestone tests: all passing / N regressions
   - Future milestone tests: still failing (expected)
4. **Acceptance criteria checklist:** For each criterion in M${milestone}:
   - [x] Satisfied (test passes)
   - [ ] Not satisfied (and why)
5. **Spec gaps discovered:** Any issues found in the architecture or gameplan
6. **Conventions file updates:** List any insights added to the target repo's conventions file (e.g., \`AGENTS.md\`, \`CLAUDE.md\`), or "None" if no new insights
7. **ADRs generated:** List any ADRs written during this milestone (with titles), or "None"
8. **Progress file:** Confirm that progress.md artifact on \`${item.id}\` was updated with the milestone entry
9. **Next step:** ${milestone < totalMilestones ? `"The next milestone is M${milestone + 1}. Run \\\`/work ${item.id}\\\` when ready."` : `"All milestones are implemented. The project branch \\\`<branch-prefix>${item.id}\\\` is ready for review. Next step: run \\\`/work ${item.id}\\\` to proceed to code review."`}

## ADR Template

\`\`\`\`markdown
# ADR-NNN: [Title]

**Date:** [YYYY-MM-DD]
**Status:** Accepted
**Project:** ${item.id}
**Stage:** 5

## Context

[What problem or question arose, and why a decision was needed]

## Decision

[What was decided]

## Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| **Chosen approach** | ... | ... |
| Alternative 1 | ... | ... |

## Consequences

[What this enables, constrains, or implies for future work]
\`\`\`\`

## Success Criteria

- [ ] All M${milestone} tests pass
- [ ] No existing tests broken (regression-free)
- [ ] Code follows the conventions file
- [ ] Migrations run cleanly
- [ ] API endpoints match architecture proposal exactly (if applicable)
- [ ] Security scoping in place (if Pipeline Configuration has Multi-Tenant Security)
- [ ] No dead code, TODOs, or debugging artifacts`;
}
