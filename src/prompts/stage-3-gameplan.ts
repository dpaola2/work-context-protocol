import type { WcpAdapter, WorkItem } from "../adapter.js";
import type { GetPromptResult } from "./helpers.js";
import { embedWorkItem, embedArtifact, textMessage } from "./helpers.js";

export async function gameplanPrompt(
  item: WorkItem,
  adapter: WcpAdapter,
): Promise<GetPromptResult> {
  const prd = await adapter.getArtifact(item.id, "prd.md");
  const discovery = await adapter.getArtifact(item.id, "discovery-report.md");
  const arch = await adapter.getArtifact(item.id, "architecture-proposal.md");

  return {
    description: `Stage 3: Gameplan for ${item.id}`,
    messages: [
      embedWorkItem(item),
      embedArtifact(item.id, "prd.md", prd.content),
      embedArtifact(item.id, "discovery-report.md", discovery.content),
      embedArtifact(item.id, "architecture-proposal.md", arch.content),
      textMessage(buildGameplanInstructions(item)),
    ],
  };
}

export async function gameplanReviewPrompt(
  item: WorkItem,
  adapter: WcpAdapter,
): Promise<GetPromptResult> {
  const gameplan = await adapter.getArtifact(item.id, "gameplan.md");

  return {
    description: `Stage 3: Gameplan Review for ${item.id}`,
    messages: [
      embedWorkItem(item),
      embedArtifact(item.id, "gameplan.md", gameplan.content),
      textMessage(buildGameplanReviewInstructions(item)),
    ],
  };
}

function buildGameplanInstructions(item: WorkItem): string {
  return `# Stage 3: Gameplan

You are a **project planner**. You synthesize the PRD, Discovery Report, and APPROVED Architecture Proposal into an actionable Engineering Gameplan — the document the team builds against.

**The architecture has been reviewed and approved. Treat it as settled fact.** If you discover issues with the architecture while building the gameplan, flag them as open questions for human review. Do not modify the architecture.

## Inputs & Outputs

- **Input 1:** The PRD for ${item.id} (embedded above as a resource)
- **Input 2:** The Discovery Report for ${item.id} (embedded above as a resource)
- **Input 3:** The Architecture Proposal for ${item.id} (embedded above as a resource — MUST be approved)
- **Output:** \`wcp_attach(${item.id}, ...)\` → \`gameplan.md\`

## Before You Start

**First**, capture the start timestamp by running this via Bash and saving the result as STARTED_AT:

\`\`\`bash
date +"%Y-%m-%dT%H:%M:%S%z"
\`\`\`

After confirming the architecture is approved (embedded above), read these files:

1. Locate the **conventions file** in the current repo root — look for \`CLAUDE.md\`, \`AGENTS.md\`, or \`CONVENTIONS.md\` (use the first one found). Read it in full.
2. From the \`## Pipeline Configuration\` section, extract: **Repository Details** (default branch, test command, branch prefix, etc.), **Platforms**, **Framework & Stack**, and all other pipeline config sub-sections. Understand which optional concerns apply (multi-tenant, feature flags, exports, backwards compat).
3. The PRD, Discovery Report, and APPROVED Architecture Proposal are all embedded above

## Step-by-Step Procedure

### 1. Break PRD Into Functional Milestones

Organize by **feature area**, not by platform:

- **M0: Discovery & Alignment** — Always complete (Stages 1-2 did this). Mark as done.
- **M1** typically: Data model, core backend, foundational API
- **M2+**: Progressive feature areas building on M1
- **Penultimate milestone (always):** QA Test Data — a seed task (per Pipeline Configuration → Framework & Stack Seed command format) that seeds realistic data for manual QA. Comes after all feature implementation milestones and before the final polish/edge-cases milestone. See the gameplan template for the standard structure and acceptance criteria.
- **Final milestone:** Empty states, edge cases, polish

Guidelines:
- Each milestone should be independently shippable (even behind a feature flag)
- Size each milestone using t-shirt sizes: **S** (1-3 files, no new patterns), **M** (5-10 files, follows existing conventions), **L** (10-20 files, new patterns), **XL** (20+ files, should probably be split)
- If a milestone is L or XL, consider splitting it into smaller milestones
- Progress from data/core → UI → integration

### 2. Generate Acceptance Criteria Per Milestone

For each milestone:
- Map PRD requirement IDs (e.g., ENT-001, CFG-003, DDV-020) to specific acceptance criteria
- Each criterion must be specific and testable
- Include both happy path and edge cases (reference PRD Section 10 for edge cases)
- No ambiguity about what "done" means
- A QA person should be able to read each criterion and know exactly what to test

### 3. Map Platform Tasks Within Each Milestone

For each milestone, create one task section per **active platform** from Pipeline Configuration → Platforms table:
- **Primary platform tasks:** Specific files to create/modify, endpoints, views, controllers, tests
- **Additional platform tasks:** One section per additional active platform from Pipeline Configuration → Platforms. Mark "N/A" for platforms not in scope for this project level.

Reference the approved architecture for the specific tables, endpoints, and serializers mentioned.

### 4. Fill Non-Functional Requirements Checklist

Complete every section of the non-functional checklist in the template:

- **Data Model & API:** Reference the approved architecture (don't restate it — link to it)
- **Security & Access Control:** Scoping, authorization, permissions from the architecture
- **Performance:** Query patterns, indexing strategy, N+1 risks, caching needs
- **Observability:** Logging plan, debug path, alerts
- **Analytics & Instrumentation:** Success metrics from the PRD, specific events to track (with names, triggers, and properties), and what framework/approach to use. If the target repo has no analytics infrastructure, note that and skip the events table. Check Pipeline Configuration and the discovery report for existing analytics patterns.
- **Testing Plan:** What types of tests per platform, coverage expectations
- **Feature Flags & Rollout:** Flag name, default state, rollout plan
- **Mobile-Specific:** Mark N/A if Pipeline Configuration → Platforms does not list mobile platforms
- **Legacy & Migration:** Backwards compatibility from the architecture
- **Export/Reporting:** Export requirements from the PRD

### 5. Identify Dependencies and Risks

- Inter-milestone dependencies (which milestones block which)
- External dependencies (third-party services, team availability)
- Technical risks with mitigation strategies
- Dependencies must form a valid DAG (no circular dependencies)

### 6. Define Release Plan

- Phased rollout approach (or single-phase if the PRD specifies it)
- Feature flag strategy
- Done criteria for each phase

### 7. Backfill Architecture Approval Timestamp

If the architecture proposal has YAML frontmatter with an empty \`pipeline_approved_at\` field, fill it now:

1. Read the architecture proposal: \`wcp_get_artifact(${item.id}, "architecture-proposal.md")\`
2. Parse the frontmatter to find the empty \`pipeline_approved_at:\` field.
3. Look for the approval date in the Approval Checklist section (the \`### Date:\` field). Parse it into ISO 8601 format. If no date is found, use the current timestamp: \`date +"%Y-%m-%dT%H:%M:%S%z"\`.
4. Modify the content string to fill in the \`pipeline_approved_at:\` field with the resolved timestamp (quoted).
5. Reattach the updated architecture proposal:
   \`\`\`
   wcp_attach(
     id=${item.id},
     type="architecture",
     title="Architecture Proposal",
     filename="architecture-proposal.md",
     content="[modified content]"
   )
   \`\`\`

### 8. Write the Engineering Gameplan

Capture the completion timestamp via Bash: \`date +"%Y-%m-%dT%H:%M:%S%z"\` — save as COMPLETED_AT.

Prepend YAML frontmatter to the gameplan content before writing. **Important:** Include \`approval: pending\` in the frontmatter — this is a gate artifact that requires human approval before the pipeline proceeds.

\`\`\`yaml
---
pipeline_stage: 3
pipeline_stage_name: gameplan
pipeline_project: "${item.id}"
pipeline_started_at: "<STARTED_AT>"
pipeline_completed_at: "<COMPLETED_AT>"
approval: pending
---
\`\`\`

Build the full gameplan content (with frontmatter) using the Output Template section below, then attach it:

\`\`\`
wcp_attach(
  id=${item.id},
  type="gameplan",
  title="Gameplan",
  filename="gameplan.md",
  content="[full gameplan with frontmatter]"
)
\`\`\`

Then log completion:

\`\`\`
wcp_comment(
  id=${item.id},
  author="pipeline/gameplan",
  body="Stage 3 complete — Gameplan attached as gameplan.md"
)
\`\`\`

**Important:** Include the Approval Checklist section from the template (with Status: Pending). This is the gate the next stage checks before generating tests.

### 9. Coherence Verification (MANDATORY)

After writing the gameplan, re-read it alongside the PRD and architecture proposal and run every check below. **Fix any failures before presenting the gameplan to the user.** These checks prevent errors that propagate through Stage 4 (tests), Stage 5 (implementation), and Stage 7 (QA plan).

#### Check 1: Traceability Completeness

For every requirement ID in the **PRD Traceability Matrix** (Section at the bottom of the gameplan), verify that at least one milestone has a matching acceptance criterion checkbox that references that ID.

- **Pass:** Every row in the traceability matrix has a corresponding \`- [ ] ID:\` checkbox in a milestone
- **Fail:** Requirement ID appears in the traceability matrix but has no acceptance criterion → add the missing criterion to the correct milestone

#### Check 2: Reverse Traceability

For every acceptance criterion that references a PRD requirement ID (e.g., \`IMP-004\`, \`SUB-001\`), verify that the ID exists in the PRD.

- **Pass:** Every referenced ID exists in the PRD's requirements sections
- **Fail:** Acceptance criterion references a non-existent ID → fix the ID or remove the criterion

#### Check 3: Architecture Element Coverage

Read the architecture proposal's "Files to Create" and "Files to Modify" lists (or equivalent sections). Verify every file appears in at least one milestone's platform tasks.

- **Pass:** Every file from the architecture proposal is referenced in a milestone
- **Fail:** Architecture proposes a file that no milestone creates/modifies → add it to the appropriate milestone

#### Check 4: PRD Edge Cases

Read PRD Section 8 (Edge Cases & Business Rules). For each edge case row, verify one of:
- An acceptance criterion explicitly addresses it, OR
- The edge case is handled by existing system behavior (note this in the gameplan if not obvious)

- **Pass:** Every PRD edge case is traceable to a criterion or documented as already-handled
- **Fail:** Edge case has no coverage → add an acceptance criterion or a note explaining why it's already covered

#### Check 5: Dependency DAG

Verify that milestone dependencies form a valid directed acyclic graph:
- No milestone depends on itself
- No circular dependency chains (e.g., M2 → M3 → M2)
- Every dependency references a milestone that exists in the gameplan

#### Check 6: Milestone Self-Consistency

Every milestone (except M0) must have ALL of:
- A \`**What:**\` description
- A \`**Size:**\` designation (S/M/L/XL)
- At least one acceptance criterion (\`- [ ]\` checkbox)
- At least one platform task
- A \`**Dependencies:**\` line

#### Check 7: Cross-Milestone File Consistency

No two milestones should both claim to **create** the same file. A file created in M1 can be **modified** in M3, but it should not appear as a creation task in both.

---

If all 7 checks pass, the gameplan is ready for human review. If any check fails, fix the gameplan and re-run that check before proceeding.

## What NOT To Do

- **Do not modify the architecture.** It has been approved. Flag issues as open questions.
- **Do not explore the codebase.** Work from documents only.
- **Do not use vague acceptance criteria.** Not "it should work" or "performance should be acceptable." Be specific.
- **Do not skip the non-functional requirements checklist.** Every item must be addressed.
- **Do not combine all work into one milestone.** Break it down. Small milestones are better than large ones.
- **Do not create milestones organized by platform.** Organize by feature area. Platform tasks go inside each milestone.

## When You're Done

Tell the user:
1. The engineering gameplan has been written
2. Summarize the milestone breakdown (number of milestones, names, estimated scope)
3. List any open questions or risks that need human input
4. **Remind them:** "This gameplan must be reviewed and approved before the next stage. Run \`/work ${item.id}\` to review and approve it."

## Output Template

\`\`\`markdown
---
pipeline_stage: 3
pipeline_stage_name: gameplan
pipeline_project: "${item.id}"
pipeline_started_at: "[ISO 8601 timestamp]"
pipeline_completed_at: "[ISO 8601 timestamp]"
approval: pending
---

# [Feature Name] - Engineering Gameplan

> **Generated by:** Pipeline Stage 3 (Gameplan)
> **Date:** [Date]
> **PRD:** ${item.id}/prd.md
> **Discovery Report:** ${item.id}/discovery-report.md
> **Approved Architecture:** ${item.id}/architecture-proposal.md

---

## 1. Project Overview

### Goals
- [What does success look like?]
- [What are we shipping?]

### Scope Summary

| Ticket | Description | Platform |
|--------|-------------|----------|
| ${item.id} | [Brief description] | [Platform from Pipeline Configuration] |

### Out of Scope
- [Explicitly what we're NOT doing]

### Constraints & Conventions
- Conventions file: [Link to conventions file from Pipeline Configuration → Repository Details]
- [Any project-specific constraints]

---

## 2. Open Questions & Decisions

> Resolved during Stages 1-2 (Discovery + Architecture)

| Question | Status | Decision |
|----------|--------|----------|
| [Question from discovery] | Resolved | [Decision] |
| [Question from architecture] | Resolved | [Decision] |
| [Remaining question] | Open | [Needs human input] |

---

## 3. Functional Milestones

> Organized by FEATURE AREA, not by platform.

### M0: Discovery & Alignment (Complete)
- [x] PRD parsed and understood (Stage 1)
- [x] Current state documented across platforms (Stage 1)
- [x] Data model proposed and **approved** (Stage 2 + Architecture Review)
- [x] API endpoints designed with example payloads and **approved** (Stage 2 + Architecture Review)
- [x] Open questions resolved (Stages 1-2)

### M1: [Feature Area 1 - e.g., Data Model & Core API]
**What:** [Brief description]
**Size:** S / M / L / XL

**Acceptance Criteria:**
- [ ] [XX-001]: [Specific, testable criterion]
- [ ] [XX-002]: [Specific, testable criterion]
- [ ] [XX-003]: [Specific, testable criterion]

**[Primary platform from Pipeline Configuration]:**
- [ ] Migration: [create/alter table]
- [ ] Model: [Model with validations, associations, scopes/queries]
- [ ] Controller/handler: [Endpoints/routes]
- [ ] Serializer: [if applicable per Pipeline Configuration]
- [ ] Tests: [test types per framework]

<!-- Include one task section per additional active platform from Pipeline Configuration → Platforms.
     Mark "N/A" for platforms not in scope for this project level. -->

**Dependencies:** None (first milestone)

---

### M2: [Feature Area 2 - e.g., Admin UI]
**What:** [Brief description]
**Size:** S / M / L / XL

**Acceptance Criteria:**
- [ ] [XX-010]: [Criterion]
- [ ] [XX-011]: [Criterion]

**[Primary platform from Pipeline Configuration]:**
- [ ] [Specific tasks]

**Dependencies:** M1 (needs data model)

---

### M3: [Feature Area 3]
**What:** [Brief description]
**Size:** S / M / L / XL

**Acceptance Criteria:**
- [ ] [XX-020]: [Criterion]

**[Primary platform from Pipeline Configuration]:**
- [ ] [Specific tasks]

**Dependencies:** M1 (needs core implementation)

---

[Continue feature milestones as needed]

---

### M_PENULTIMATE_: QA Test Data
**What:** Create a seed task that populates realistic test data covering all feature scenarios. This enables manual QA without requiring testers to construct their own data. (Task format per Pipeline Configuration → Framework & Stack — e.g., rake task, management command, script.)

**Acceptance Criteria:**
- [ ] Seed task exists in the appropriate location (per Pipeline Configuration → Directory Structure, e.g., seed tasks directory)
- [ ] Task creates test account(s) with appropriate permissions and roles
- [ ] Task seeds data covering: happy path, empty states, edge cases, threshold boundaries
- [ ] Task is idempotent (can re-run without duplicating data)
- [ ] Task prints a summary of what was created (account credentials, key IDs, URLs to test)
- [ ] All scenarios from the manual QA checklist have supporting test data

**[Primary platform from Pipeline Configuration]:**
- [ ] Seed task file — idempotent (per Pipeline Configuration → Framework & Stack Seed command format)
- [ ] Uses existing test data helpers where available
- [ ] No production-unsafe operations (dev/staging only)

**Dependencies:** All prior feature milestones (needs the full feature implemented)

---

### M_LAST_: Empty States, Edge Cases & Polish
**What:** [Implement all empty state messages, handle edge cases, polish UI]

**Acceptance Criteria:**
- [ ] [UI empty state scenarios]
- [ ] [Edge case handling]
- [ ] [Print styles, responsive behavior]

**[Primary platform from Pipeline Configuration]:**
- [ ] [View/UI updates]

**Dependencies:** All prior milestones

---

## 4. Non-Functional Requirements Checklist

### Data Model & API
> These were reviewed and approved in the Architecture Review checkpoint. Reference the approved architecture for details.

- [ ] Architecture proposal approved: ${item.id}/architecture-proposal.md
- [ ] Milestones correctly reference the approved data model and API design
- [ ] No contradictions between gameplan and approved architecture

### Security & Access Control
- [ ] All queries scoped to account/user
- [ ] Controller authorization in place
- [ ] Feature permissions respected
- [ ] Area-based access respected (if applicable)
- [ ] API authentication required
- [ ] No new attack surfaces

### Performance
- [ ] Data volume x access frequency considered
- [ ] Query patterns identified
- [ ] Indexes sufficient
- [ ] Caching needed? [Yes/No]
- [ ] N+1 query risks identified

### Observability & Debuggability
- [ ] Logging plan (events, fields)
- [ ] Logs are human-readable
- [ ] Debug path exists without production access
- [ ] Alerts needed? [Yes/No]

### Analytics & Instrumentation

#### Success Metrics
> How will we know this feature is working? Reference PRD goals or define measurable outcomes.

- [ ] [e.g., "50% of accounts with eligible data use the report within 30 days"]
- Or: N/A — no measurable success criteria for this feature

#### Events to Track

| Event Name | Trigger | Key Properties | Platform |
|------------|---------|----------------|----------|
| [e.g., report.viewed] | [User opens the report page] | [account_id, user_id, filter_count] | [Web] |

_If the product has no event tracking infrastructure, note that here and skip the table._

#### Instrumentation Approach
- [ ] Framework: [e.g., "server-side logging", "custom analytics table", "none — no tracking infrastructure yet"]
- [ ] Implementation location: [e.g., "Controller callbacks", "service layer"]

### Testing Plan

| Type | Coverage | Platform | Owner |
|------|----------|----------|-------|
| Model/unit tests | [What's covered] | [Primary platform from Pipeline Configuration] | Pipeline |
| Request/integration tests | [What's covered] | [Primary platform from Pipeline Configuration] | Pipeline |
| System/E2E tests | [What's covered] | [Primary platform from Pipeline Configuration] | Pipeline |
| Manual QA | [Key scenarios] | All | Human |

> Add rows for additional active platforms from Pipeline Configuration → Platforms if Level 3.

### Feature Flags & Rollout
- [ ] Feature flag: [flag_name]
- [ ] Default: Off
- [ ] Beta flag for select accounts
- [ ] Rollout plan: [phases]

### Mobile-Specific
<!-- CONDITIONAL: Include only if Pipeline Configuration → Platforms lists mobile platforms (iOS, Android). Otherwise omit. -->
- [ ] Mobile analytics events planned
- [ ] Crash reporting considerations
- [ ] Offline behavior defined (if applicable)
- [ ] Min OS version implications

### Legacy & Migration
- [ ] Old client experience documented (compatibility matrix)
- [ ] Backward compatibility requirements met
- [ ] Data migration from old → new (if applicable)

### Export/Reporting
- [ ] Export requirements addressed
- [ ] Export backwards compatibility maintained
- [ ] N/A

---

## 5. Dependencies & Risks

| Risk/Dependency | Impact | Mitigation |
|-----------------|--------|------------|
| [Risk 1] | High / Med / Low | [Mitigation strategy] |
| [Dependency 1] | [Impact] | [How we handle it] |

---

## 6. Release Plan

### Phases

| Phase | What Ships | Flag State | Audience |
|-------|-----------|------------|----------|
| Phase 1 | [Milestones M1-M2] | Beta ON for test accounts | Internal |
| Phase 2 | [All milestones] | Beta ON for select customers | Beta customers |
| Phase 3 | [GA] | Feature ON for all | All customers |

### Done Criteria
- [ ] All acceptance criteria met
- [ ] All tests passing
- [ ] Feature flag enabled for beta accounts
- [ ] Observability in place
- [ ] QA sign-off

---

## 7. Estimates

| Milestone | Size | Notes |
|-----------|------|-------|
| M0: Discovery | Done | Pipeline Stages 0-2 |
| M1: [Name] | S / M / L / XL | |
| M2: [Name] | S / M / L / XL | |
| M3: [Name] | S / M / L / XL | |

**Size guide:** S = 1-3 files, no migrations, no new patterns. M = 5-10 files, simple migration, follows existing conventions. L = 10-20 files, complex migrations, new patterns. XL = 20+ files, should probably be split.

---

## 8. PRD Traceability Matrix

| Requirement ID | Description | Milestone(s) |
|---------------|-------------|---------------|
| [XX-001] | [Description] | M1 |
| [XX-002] | [Description] | M1 |
| [XX-010] | [Description] | M2 |

---

## Approval Checklist

> **This gameplan requires human review and approval before test generation begins.**

### Reviewer: ___________
### Date: ___________
### Status: Pending

#### Must Verify
- [ ] Milestone breakdown is logical and correctly sequenced
- [ ] Acceptance criteria are specific and testable
- [ ] Every PRD requirement ID is mapped to a milestone (traceability matrix complete)
- [ ] Non-functional requirements checklist is fully addressed
- [ ] Dependencies form a valid DAG (no circular dependencies)
- [ ] Milestone sizes are appropriate (no XL milestones that should be split)
- [ ] Release plan is appropriate

#### Optional Notes
[Any modifications, corrections, or additional context for the implementation team]

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| [Date] | Pipeline | Initial gameplan generated |
| [Date] | [Human reviewer] | Approved with modifications: [notes] |
\`\`\`

## Success Criteria

- [ ] Every PRD requirement traceable to a milestone
- [ ] Every milestone has specific, testable acceptance criteria
- [ ] Platform tasks explicit (no ambiguity)
- [ ] Non-functional checklist complete
- [ ] Dependencies clear and form valid sequence
- [ ] Developer could read this and know exactly what to build
- [ ] QA person could read acceptance criteria and know exactly what to test`;
}

function buildGameplanReviewInstructions(item: WorkItem): string {
  return `# Gameplan Review

The engineering gameplan for ${item.id} is ready for human review.

## Review Process

The gameplan is embedded above as a resource. Please review it carefully, focusing on:

### Must Verify
- **Milestone breakdown** — Is it logical and correctly sequenced?
- **Acceptance criteria** — Are they specific and testable?
- **Traceability** — Is every PRD requirement ID mapped to a milestone?
- **Non-functional requirements** — Is the checklist fully addressed?
- **Dependencies** — Do they form a valid DAG (no circular dependencies)?
- **Milestone sizes** — Are they appropriate (no XL milestones that should be split)?
- **Release plan** — Is it appropriate for this feature?

### Should Check
- Platform tasks are explicit and complete
- Estimates are reasonable
- Risks and mitigations make sense
- Open questions have been addressed or flagged

## Recording Your Decision

When you have reviewed the gameplan and made a decision, call:

**To approve:**
\`\`\`
wcp_approve("${item.id}", "gameplan.md", "approved")
\`\`\`

**To reject (with feedback):**
\`\`\`
wcp_approve("${item.id}", "gameplan.md", "rejected")
\`\`\`

If rejecting, also leave a comment with your feedback:
\`\`\`
wcp_comment(
  id=${item.id},
  author="[reviewer name]",
  body="Gameplan review feedback: [your feedback here]"
)
\`\`\`

After approval, run \`/work ${item.id}\` to proceed to Test Generation (Stage 4).`;
}
