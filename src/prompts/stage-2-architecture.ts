import type { WcpAdapter, WorkItem } from "../adapter.js";
import type { GetPromptResult } from "./helpers.js";
import { embedWorkItem, embedArtifact, textMessage } from "./helpers.js";

export async function architecturePrompt(
  item: WorkItem,
  adapter: WcpAdapter,
): Promise<GetPromptResult> {
  const prd = await adapter.getArtifact(item.id, "prd.md");
  const discovery = await adapter.getArtifact(item.id, "discovery-report.md");

  return {
    description: `Stage 2: Architecture for ${item.id}`,
    messages: [
      embedWorkItem(item),
      embedArtifact(item.id, "prd.md", prd.content),
      embedArtifact(item.id, "discovery-report.md", discovery.content),
      textMessage(buildArchitectureInstructions(item)),
    ],
  };
}

export async function architectureReviewPrompt(
  item: WorkItem,
  adapter: WcpAdapter,
): Promise<GetPromptResult> {
  const arch = await adapter.getArtifact(item.id, "architecture-proposal.md");

  return {
    description: `Stage 2: Architecture Review for ${item.id}`,
    messages: [
      embedWorkItem(item),
      embedArtifact(item.id, "architecture-proposal.md", arch.content),
      textMessage(buildArchitectureReviewInstructions(item)),
    ],
  };
}

function buildArchitectureInstructions(item: WorkItem): string {
  return `# Stage 2: Architecture

You are a **technical designer**. You propose the data model, API endpoints, migrations, backwards compatibility approach, and security scoping for a feature. Your output is an Architecture Proposal that must be reviewed and approved by a human before the next stage.

## Inputs & Outputs

- **Input 1:** The PRD for ${item.id} (embedded above as a resource)
- **Input 2:** The Discovery Report for ${item.id} (embedded above as a resource)
- **Output:** \`wcp_attach(${item.id}, ...)\` → \`architecture-proposal.md\`
- **Output (conditional):** \`wcp_attach(${item.id}, ...)\` → \`ADR-*.md\` — one per significant decision with 2+ viable alternatives

## Before You Start

**First**, capture the start timestamp by running this via Bash and saving the result as STARTED_AT:

\`\`\`bash
date +"%Y-%m-%dT%H:%M:%S%z"
\`\`\`

Then read these files in order:

1. Locate the **conventions file** in the current repo root — look for \`CLAUDE.md\`, \`AGENTS.md\`, or \`CONVENTIONS.md\` (use the first one found). Read it in full. From the \`## Pipeline Configuration\` section, extract: **Repository Details** (default branch, test command, branch prefix, etc.), and all other pipeline config sub-sections (Framework & Stack, Directory Structure, API Conventions, Multi-Tenant Security, etc.). **Critical**: pay special attention to database conventions, serialization patterns, API response structure, security scoping patterns, and API versioning.
2. The PRD is embedded above — understand what we're building
3. The Discovery Report is embedded above — understand what exists today

## Step-by-Step Procedure

### 1. Start From the Discovery Report

Build on what exists. Do not reinvent. Note:
- Existing models and their associations
- Current schema for related tables
- Existing serialization patterns
- Current API response formats
- Existing test patterns

### 2. Design Data Model Changes

For new tables:
- Full schema following the primary key convention from Pipeline Configuration → API Conventions and the conventions file
- All columns with types, constraints, defaults, nullability
- Foreign keys with references
- Indexes (following the migration conventions from the conventions file)
- Follow table naming conventions from the conventions file

For modified tables:
- ALTER TABLE statements
- New columns with types and constraints
- New indexes

Include:
- Model code following the framework conventions from Pipeline Configuration and the conventions file (associations, validations, scopes/queries)
- Associations map (visual representation of relationships)
- Expected data volumes and growth rates

### 3. Plan Migrations

For each migration:
- Type (DDL, data migration, concurrent index)
- Migration code per framework conventions
- Whether it needs special transaction handling (e.g., \`disable_ddl_transaction!\` for Rails, equivalent for other frameworks)
- Backfill strategy (if migrating existing data)
- Rollback plan

### 4. Design API Endpoints

**If Pipeline Configuration has an "API Conventions" section**, design the endpoints below. **Otherwise**, mark this section as "N/A — not applicable for this project type" in the output and skip.

For each endpoint:
- HTTP method, path, purpose
- Full example request JSON (with all fields, realistic values)
- Full example response JSON (with all fields, realistic values)
- Error response examples following the error format from Pipeline Configuration → API Conventions
- Authorization requirements
- Scoping chain (following the security model from Pipeline Configuration → Multi-Tenant Security, if applicable)
- Serializer design following the serialization framework from Pipeline Configuration → Framework & Stack

**Important:** Follow the response envelope convention from Pipeline Configuration → API Conventions.

### 5. Analyze Backwards Compatibility

**If Pipeline Configuration has a "Backwards Compatibility" section**, generate the compatibility matrix below. **Otherwise**, mark this section as "N/A — not applicable for this project" in the output and skip.

Generate the compatibility matrix:
- What each platform version sees
- For Level 2 (web-only) projects: the matrix is simpler but still required — document what web users see and confirm no impact on existing API consumers
- What breaks vs what continues to work
- API versioning approach (if needed)

### 6. Design Security Model

**If Pipeline Configuration has a "Multi-Tenant Security" section**, follow its scoping and authorization rules for every new data access path. **Otherwise**, focus on authentication and authorization without tenant-scoping.

For every new data access path:
- Query scoping chain (per the scoping rules in Pipeline Configuration)
- Authorization model (who can do what, which roles/permissions)
- Permission requirements
- New attack surface analysis

### 7. Assess Export Impact

**If the PRD mentions exports or Pipeline Configuration has export-related features**, assess the impact below. **Otherwise**, mark this section as "N/A — no export impact" in the output and skip.

- How new data appears in existing exports (PDF, CSV, email reports)
- New export requirements from the PRD
- Export format backwards compatibility

### 8. Document Open Questions

For each unresolved decision:
- State the question clearly
- Provide 2+ options with trade-offs
- Give your recommendation with rationale
- **No "TBD" allowed.** Every section must be complete or explicitly flagged as a question with options.

### 9. Document Alternatives Considered

For significant design decisions:
- What alternative approaches you considered
- Pros and cons of each
- Why you chose the proposed approach

### 10. Generate ADRs

For each significant decision that had 2+ genuinely viable alternatives, attach an ADR:

\`\`\`
wcp_attach(
  id=${item.id},
  type="adr",
  title="ADR-NNN: [Title]",
  filename="ADR-NNN-title.md",
  content="[ADR content]"
)
\`\`\`

- Use the ADR Template section below as the format
- Sequential numbering starting at 001 (e.g., \`ADR-001-service-vs-concern.md\`)
- Set \`Stage: 2\` in the metadata
- Not every design choice needs an ADR — only choices where alternatives were genuinely viable and the rationale matters for future understanding
- If no decisions warrant an ADR, skip this step

### 11. Write the Architecture Proposal

Capture the completion timestamp via Bash: \`date +"%Y-%m-%dT%H:%M:%S%z"\` — save as COMPLETED_AT.

Prepend YAML frontmatter to the proposal content before attaching. **Important:** Include \`approval: pending\` in the frontmatter — this is a gate artifact that requires human approval before the pipeline proceeds.

\`\`\`yaml
---
pipeline_stage: 2
pipeline_stage_name: architecture
pipeline_project: "${item.id}"
pipeline_started_at: "<STARTED_AT>"
pipeline_completed_at: "<COMPLETED_AT>"
approval: pending
---
\`\`\`

Attach the proposal (with frontmatter) using the Output Template section below:

\`\`\`
wcp_attach(
  id=${item.id},
  type="architecture",
  title="Architecture Proposal",
  filename="architecture-proposal.md",
  content="[full proposal with frontmatter]"
)
\`\`\`

Then post a completion comment:

\`\`\`
wcp_comment(
  id=${item.id},
  author="pipeline/architecture",
  body="Stage 2 complete — Architecture proposal attached as architecture-proposal.md [+ N ADRs]"
)
\`\`\`

**Important:** The template includes an Approval Checklist section at the end. Leave the Status as "Pending" — the human reviewer will update it.

## Referencing the Codebase

When you need to:
- Verify existing patterns: search the codebase using the directories from Pipeline Configuration → Directory Structure
- Check naming conventions: look at existing code in the relevant directories
- Understand auth patterns: look at existing controllers
- See serialization examples: look at the serializer directory from Pipeline Configuration

If Pipeline Configuration → Related Repositories lists an API docs repository, reference it for existing response shapes, pagination patterns, error format examples, and sync patterns.

**Do NOT modify any files.** Read only.

## What NOT To Do

- **Do not leave any section as "TBD."** Complete every section or flag it as an open question with options.
- **Do not skip the backwards compatibility matrix** if Pipeline Configuration has a Backwards Compatibility section.
- **Do not skip security design.** Every new data access path needs authentication and authorization. If Pipeline Configuration has Multi-Tenant Security, also include tenant scoping chains.
- **Do not modify any files in the repo.**
- **Do not generate the gameplan.** That is Stage 3, and it requires approved architecture first.
- **Do not invent new patterns** when existing codebase patterns will work. Follow what exists.

## When You're Done

Tell the user:
1. The architecture proposal has been written
2. Summarize the key design decisions (new tables, endpoints, migration approach)
3. List ADRs generated (with titles), or "None" if no decisions warranted an ADR
4. List the open questions that need human input
5. **Remind them:** "This architecture proposal must be reviewed and approved before the next stage. Run \`/work ${item.id}\` to review and approve it."

## ADR Template

\`\`\`markdown
# ADR-NNN: [Title]

**Date:** [YYYY-MM-DD]
**Status:** Accepted
**Project:** ${item.id}
**Stage:** [2 or 5]

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
\`\`\`

## Output Template

\`\`\`markdown
---
pipeline_stage: 2
pipeline_stage_name: architecture
pipeline_project: "${item.id}"
pipeline_started_at: "[ISO 8601 timestamp]"
pipeline_completed_at: "[ISO 8601 timestamp]"
approval: pending
---

# [Feature Name] - Architecture Proposal

> **Generated by:** Pipeline Stage 2 (Architecture)
> **Date:** [Date]
> **PRD:** ${item.id}/prd.md
> **Discovery Report:** ${item.id}/discovery-report.md

---

## 1. Data Model Changes

### New Tables

[SQL CREATE TABLE statements with columns, constraints, indexes]

### Modified Tables

[SQL ALTER TABLE statements]

### Models

[Model code following framework conventions from Pipeline Configuration and the conventions file.
Include: associations/relationships, validations/constraints, scopes/queries, class methods.
If Pipeline Configuration has Multi-Tenant Security, include the tenant-scoping scope/query.
Use the language and framework idioms from Pipeline Configuration → Framework & Stack.]

### Associations Map

[Visual representation of model relationships]

### Migration Plan

| Migration | Type | Notes |
|-----------|------|-------|
| Create [table] | DDL | Standard table creation per framework conventions |
| Add index on [table.column] | DDL | Concurrent if supported by framework/database |
| Backfill [column] | Data | [Strategy: batch update, background job, etc.] |

### Expected Data Volumes

| Table | Expected Records | Access Frequency | Growth Rate |
|-------|-----------------|------------------|-------------|
| [table] | [estimate] | [reads/writes per day] | [per month] |

---

## 2. API Endpoints

<!-- CONDITIONAL: Include this section only if Pipeline Configuration has an "API Conventions" section.
     Otherwise write: "N/A — this project does not expose an API." -->

### New Endpoints

#### [METHOD] /api/v1/[path]

**Purpose:** [What this endpoint does]

**Authorization:** [Who can call this, what permissions needed]

**Scoping:** [per Pipeline Configuration → Multi-Tenant Security, if applicable]

**Request:**
[JSON request example]

**Response (2XX):**
[JSON response example]

**Error Response (422):**
[Error format per Pipeline Configuration → API Conventions]

**Error Response (401):**
[Error format per Pipeline Configuration → API Conventions]

---

### Modified Endpoints

| Endpoint | Change | Backwards Compatible? |
|----------|--------|----------------------|
| [Existing endpoint] | [What changes] | Yes / No |

### Serializers

[Serializer code following the serialization framework from Pipeline Configuration → Framework & Stack
and patterns from the conventions file.
Include fields, associations, and custom formatting.]

---

## 3. Backwards Compatibility

<!-- CONDITIONAL: Include this section only if Pipeline Configuration has a "Backwards Compatibility" section.
     Otherwise write: "N/A — no backwards compatibility concerns for this project." -->

### Compatibility Matrix

| Feature / Behavior | [Column per active platform and old version from Pipeline Configuration → Platforms] |
|-------------------|:---:|
| [Behavior 1] | [Full/Partial/None per platform] |
| [Behavior 2] | [Full/Partial/None per platform] |

### Old Client Behavior

> One subsection per platform with old versions (from Pipeline Configuration → Backwards Compatibility).

**[Platform] v[old]:**
- [What old client sees/doesn't see]
- [Any degraded functionality]
- [Any data that appears differently]

### API Versioning

[Does this change require API versioning? If so, what approach?]

### Data Migration

| Migration | Strategy | Rollback |
|-----------|----------|----------|
| [Existing data change] | [How: batch update, background job] | [How to undo] |

---

## 4. Security Design

### Query Scoping

<!-- CONDITIONAL: Include scoping chains only if Pipeline Configuration has a "Multi-Tenant Security" section.
     Otherwise focus on authentication and authorization only. -->

| Resource | Scoping Chain |
|----------|--------------|
| [Resource] | [Scoping chain per Pipeline Configuration → Multi-Tenant Security, if applicable] |
| [Nested resource] | [Scoping chain, if applicable] |

### Authorization

| Action | Permitted Roles | Check |
|--------|----------------|-------|
| [Action 1] | [Admin, Manager, etc.] | [How verified] |
| [Action 2] | [Roles] | [How verified] |

### New Attack Surface

| Vector | Risk | Mitigation |
|--------|------|------------|
| [Vector] | [Risk level] | [How mitigated] |

---

## 5. Export Impact

<!-- CONDITIONAL: Include this section if the PRD mentions exports or the project has export features.
     Otherwise write: "N/A — no export impact." -->

| Export | Format | Changes | Backwards Compatible? |
|-------|--------|---------|----------------------|
| [Export name] | [PDF/Excel/CSV] | [What changes] | [Yes/No] |

---

## 6. Open Questions for Human Review

| # | Question | Options | Recommendation |
|---|----------|---------|---------------|
| 1 | [Decision needed] | A: [option] / B: [option] | [Agent's recommendation with rationale] |
| 2 | [Decision needed] | [Options] | [Recommendation] |

---

## 7. Alternatives Considered

### [Alternative Approach Name]

**Description:** [What the alternative was]
**Pros:** [Advantages]
**Cons:** [Disadvantages]
**Why rejected:** [Reason]

---

## 8. Architecture Decision Records

> ADRs for significant decisions are attached as artifacts. Only decisions with 2+ genuinely viable alternatives are recorded.

<!-- If no ADRs were generated, replace the table below with: "No decisions in this project warranted a standalone ADR." -->

| ADR | Title | Summary |
|-----|-------|---------|
| ADR-001-title.md | [Title] | [One-line summary] |

---

## 9. Summary

### Files to Create
| File | Purpose |
|------|---------|
| [models dir from Pipeline Configuration]/[model file] | [Purpose] |
| [controllers dir from Pipeline Configuration]/[controller file] | [Purpose] |
| [serializers dir from Pipeline Configuration]/[serializer file] | [Purpose — if applicable] |
| [migrations dir from Pipeline Configuration]/[migration file] | [Purpose] |

### Files to Modify
| File | Changes |
|------|---------|
| [models dir from Pipeline Configuration]/[existing_model file] | Add association |
| [routes path from Pipeline Configuration] | Add new routes |

---

## Approval Checklist

> **This architecture proposal requires human review and approval before the gameplan is generated.**

### Reviewer: [Name]
### Date: [Date]
### Status: Pending

#### Must Verify
- [ ] Data model is architecturally sound (tables, columns, relationships, constraints)
- [ ] API design is consistent with existing patterns (envelopes, error format, pagination)
- [ ] Backwards compatibility is handled correctly (compatibility matrix filled out)
- [ ] Security scoping is correct (all queries scoped to account, authorization checked)
- [ ] Migration strategy is safe (concurrent indexes, backfill approach)

#### Should Check
- [ ] Serializer design matches existing conventions
- [ ] Export impact is addressed
- [ ] Open questions are answerable
- [ ] API payloads are complete enough for mobile engineers to build against
- [ ] No conflicts with in-progress work or upcoming changes

#### Notes
[Reviewer notes, modifications requested, or rejection reasons]
\`\`\`

## Success Criteria

- [ ] Data model complete (no "TBD" fields)
- [ ] Every API endpoint has full request AND response JSON examples
- [ ] Backwards compatibility matrix filled out (if Pipeline Configuration has that section)
- [ ] Migrations specified (not just "we'll need a migration")
- [ ] Security scoping explicit for every new data access path
- [ ] Proposal follows existing codebase patterns
- [ ] Open questions specific and actionable
- [ ] Engineer on another platform could read API section and know exactly what to build
- [ ] Self-contained enough for human to review without running code`;
}

function buildArchitectureReviewInstructions(item: WorkItem): string {
  return `# Architecture Review

The architecture proposal for ${item.id} is ready for human review.

## Review Process

The architecture proposal is embedded above as a resource. Please review it carefully, focusing on:

### Must Verify
- **Data model** — Are tables, columns, relationships, and constraints architecturally sound?
- **API design** — Is it consistent with existing patterns (envelopes, error format, pagination)?
- **Backwards compatibility** — Is the compatibility matrix filled out correctly?
- **Security scoping** — Are all queries scoped correctly? Is authorization checked?
- **Migration strategy** — Is it safe? (concurrent indexes, backfill approach)

### Should Check
- Serializer design matches existing conventions
- Export impact is addressed
- Open questions are answerable
- API payloads are complete enough for other engineers to build against
- No conflicts with in-progress work or upcoming changes

## Recording Your Decision

When you have reviewed the architecture proposal and made a decision, call:

**To approve:**
\`\`\`
wcp_approve("${item.id}", "architecture-proposal.md", "approved")
\`\`\`

**To reject (with feedback):**
\`\`\`
wcp_approve("${item.id}", "architecture-proposal.md", "rejected")
\`\`\`

If rejecting, also leave a comment with your feedback:
\`\`\`
wcp_comment(
  id=${item.id},
  author="[reviewer name]",
  body="Architecture review feedback: [your feedback here]"
)
\`\`\`

After approval, run \`/work ${item.id}\` to proceed to the Gameplan stage.`;
}
