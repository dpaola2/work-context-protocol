import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";
import { FilesystemAdapter } from "./adapters/filesystem.js";
import { DEFAULT_SCHEMA, type WcpConfig } from "./config.js";
import { readConfig, writeConfig } from "./config.js";
import {
  resolveSchema,
  addNamespaceStatuses,
  removeNamespaceStatuses,
  addNamespaceArtifactTypes,
  removeNamespaceArtifactTypes,
} from "./schema.js";
import {
  validateStatus,
  validatePriority,
  validateType,
  validateArtifactType,
} from "./validation.js";

const DATA_PATH =
  process.env.WCP_DATA_PATH ||
  path.join(process.env.HOME || "~", "projects", "wcp-data");

async function smokeTest() {
  console.log(`\n=== WCP Smoke Test ===`);
  console.log(`Data path: ${DATA_PATH}\n`);

  const adapter = new FilesystemAdapter(DATA_PATH);
  let pass = 0;
  let fail = 0;

  function check(label: string, ok: boolean, detail?: string) {
    if (ok) {
      console.log(`  PASS  ${label}`);
      pass++;
    } else {
      console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
      fail++;
    }
  }

  // 1. wcp_namespaces
  console.log("\n1. wcp_namespaces");
  const namespaces = await adapter.listNamespaces();
  check("returns namespaces", namespaces.length >= 3);
  check(
    "PIPE namespace exists",
    namespaces.some((n) => n.key === "PIPE"),
  );

  // 2. wcp_create
  console.log("\n2. wcp_create");
  const newId = await adapter.createItem("OS", {
    title: "Smoke test item",
    type: "chore",
    body: "Created by smoke test.",
  });
  check("returns callsign", /^OS-\d+$/.test(newId), newId);

  // 3. wcp_get
  console.log("\n3. wcp_get");
  const item = await adapter.getItem(newId);
  check("title matches", item.title === "Smoke test item");
  check("status defaults to backlog", item.status === "backlog");
  check("body preserved", item.body === "Created by smoke test.");
  check("has created date", !!item.created);

  // 4. wcp_update
  console.log("\n4. wcp_update");
  await adapter.updateItem(newId, {
    status: "in_progress",
    assignee: "smoke-test",
    addArtifacts: [
      { type: "test", title: "Test artifact", url: "test://smoke" },
    ],
  });
  const updated = await adapter.getItem(newId);
  check("status updated", updated.status === "in_progress");
  check("assignee set", updated.assignee === "smoke-test");
  check("artifact appended", updated.artifacts.length === 1);

  // 5. wcp_comment
  console.log("\n5. wcp_comment");
  await adapter.addComment(newId, "smoke-test", "This is a test comment.");
  const commented = await adapter.getItem(newId);
  check("activity has comment", commented.activity.includes("smoke-test"));
  check(
    "activity has body",
    commented.activity.includes("This is a test comment."),
  );

  // 6. wcp_list
  console.log("\n6. wcp_list");
  const allOS = await adapter.listItems("OS");
  check("OS has items", allOS.length >= 1);
  check(
    "created item in list",
    allOS.some((i) => i.id === newId),
  );

  const filtered = await adapter.listItems("OS", { status: "in_progress" });
  check(
    "filter works",
    filtered.every((i) => i.status === "in_progress"),
  );

  // Error cases
  console.log("\n7. Error handling");
  try {
    await adapter.getItem("NOPE-999");
    check("not-found error", false, "should have thrown");
  } catch (e: any) {
    check("not-found error", e.code === "NAMESPACE_NOT_FOUND" || e.code === "NOT_FOUND");
  }

  try {
    await adapter.updateItem(newId, { status: "invalid_status" as any });
    check("validation error", false, "should have thrown");
  } catch (e: any) {
    check("validation error", e.code === "VALIDATION_ERROR");
  }

  try {
    await adapter.addComment(newId, "test", "");
    check("empty comment error", false, "should have thrown");
  } catch (e: any) {
    check("empty comment error", e.code === "VALIDATION_ERROR");
  }

  // 8. Edge cases
  console.log("\n8. Edge cases");

  // Malformed callsign
  try {
    await adapter.getItem("pipe-12");
    check("malformed callsign (lowercase)", false, "should have thrown");
  } catch (e: any) {
    check("malformed callsign (lowercase)", e.code === "VALIDATION_ERROR");
  }

  try {
    await adapter.getItem("PIPE");
    check("malformed callsign (no number)", false, "should have thrown");
  } catch (e: any) {
    check("malformed callsign (no number)", e.code === "VALIDATION_ERROR");
  }

  try {
    await adapter.getItem("PIPE-abc");
    check("malformed callsign (non-numeric)", false, "should have thrown");
  } catch (e: any) {
    check("malformed callsign (non-numeric)", e.code === "VALIDATION_ERROR");
  }

  // Empty namespace list
  const emptyList = await adapter.listItems("OS", { status: "cancelled" });
  check("empty filter returns empty list", emptyList.length === 0);

  // Non-existent namespace
  try {
    await adapter.listItems("NOPE");
    check("non-existent namespace error", false, "should have thrown");
  } catch (e: any) {
    check("non-existent namespace error", e.code === "NAMESPACE_NOT_FOUND");
  }

  // Create with non-existent namespace
  try {
    await adapter.createItem("NOPE", { title: "test" });
    check("create in non-existent namespace", false, "should have thrown");
  } catch (e: any) {
    check("create in non-existent namespace", e.code === "NAMESPACE_NOT_FOUND");
  }

  // Invalid priority on create
  try {
    await adapter.createItem("OS", { title: "test", priority: "super" as any });
    check("invalid priority error", false, "should have thrown");
  } catch (e: any) {
    check("invalid priority error", e.code === "VALIDATION_ERROR");
  }

  // Invalid type on create
  try {
    await adapter.createItem("OS", { title: "test", type: "epic" as any });
    check("invalid type error", false, "should have thrown");
  } catch (e: any) {
    check("invalid type error", e.code === "VALIDATION_ERROR");
  }

  // Malformed YAML — write a broken file and try to read it
  const brokenPath = path.join(DATA_PATH, "OS", "OS-9999.md");
  fs.writeFileSync(brokenPath, "---\n: broken: yaml: {{{\n---\nsome body", "utf-8");
  const brokenItem = await adapter.getItem("OS-9999");
  check("malformed YAML returns warning", !!brokenItem.warning);
  check("malformed YAML has raw body", brokenItem.body.length > 0);
  fs.unlinkSync(brokenPath);

  // Update body preserves activity
  await adapter.addComment(newId, "body-test", "Before body update.");
  const beforeBody = await adapter.getItem(newId);
  await adapter.updateItem(newId, { body: "New body content." });
  const afterBody = await adapter.getItem(newId);
  check("body replaced", afterBody.body === "New body content.");
  check("activity preserved after body update", afterBody.activity.includes("Before body update."));

  // 9. wcp_attach
  console.log("\n9. wcp_attach");
  const prdContent = "# Test PRD\n\nThis is a test PRD for the smoke test project.";
  const attached = await adapter.attachArtifact(newId, {
    type: "prd",
    title: "Smoke Test PRD",
    filename: "prd.md",
    content: prdContent,
  });
  check("returns artifact metadata", attached.type === "prd");
  check("url has correct path", attached.url.includes(`${newId}/prd.md`));

  // Verify it's registered on the work item
  const withArtifact = await adapter.getItem(newId);
  const prdEntry = withArtifact.artifacts.find((a) => a.url.endsWith("prd.md"));
  check("artifact registered in frontmatter", !!prdEntry);

  // Attach a second artifact
  await adapter.attachArtifact(newId, {
    type: "architecture",
    title: "Architecture Proposal",
    filename: "architecture-proposal.md",
    content: "# Architecture\n\nAdapter pattern.",
  });
  const withTwo = await adapter.getItem(newId);
  check("multiple artifacts supported", withTwo.artifacts.length >= 2);

  // Overwrite existing artifact
  const updatedPrd = "# Updated PRD\n\nRevised requirements.";
  await adapter.attachArtifact(newId, {
    type: "prd",
    title: "Smoke Test PRD (v2)",
    filename: "prd.md",
    content: updatedPrd,
  });
  const afterOverwrite = await adapter.getItem(newId);
  const overwrittenEntry = afterOverwrite.artifacts.find((a) => a.url.endsWith("prd.md"));
  check("overwrite updates title", overwrittenEntry?.title === "Smoke Test PRD (v2)");
  check("artifact count unchanged on overwrite", afterOverwrite.artifacts.length === withTwo.artifacts.length);

  // 10. wcp_get_artifact
  console.log("\n10. wcp_get_artifact");
  const retrieved = await adapter.getArtifact(newId, "prd.md");
  check("retrieves content", retrieved.content === updatedPrd);
  check("retrieves metadata", retrieved.artifact.type === "prd");
  check("retrieves updated title", retrieved.artifact.title === "Smoke Test PRD (v2)");

  const retrieved2 = await adapter.getArtifact(newId, "architecture-proposal.md");
  check("retrieves second artifact", retrieved2.content.includes("Adapter pattern"));

  // Error: non-existent artifact
  try {
    await adapter.getArtifact(newId, "nope.md");
    check("missing artifact error", false, "should have thrown");
  } catch (e: any) {
    check("missing artifact error", e.code === "NOT_FOUND");
  }

  // 11. Schema resolution
  console.log("\n11. Schema resolution");
  const config = readConfig(DATA_PATH);

  // Without namespace — global defaults
  const globalSchema = resolveSchema(config);
  check("global schema has default statuses", globalSchema.status.defaults.includes("backlog"));
  check("global schema has no extensions", globalSchema.status.extensions.length === 0);
  check("global all equals defaults when no extensions", globalSchema.status.all.length === globalSchema.status.defaults.length);
  check("priority is fixed field", "values" in globalSchema.priority);
  check("type is fixed field", "values" in globalSchema.type);
  check("artifact_type has defaults", globalSchema.artifact_type.defaults.includes("prd"));
  check("artifact_type includes adr", globalSchema.artifact_type.defaults.includes("adr"));

  // With namespace — merges extensions
  const nsSchema = resolveSchema(config, "OS");
  check("namespace schema has default statuses", nsSchema.status.defaults.includes("done"));

  // 12. Schema mutation — add/remove statuses
  console.log("\n12. Schema mutation — statuses");
  const mutConfig = readConfig(DATA_PATH);

  // Add custom statuses
  const addedStatuses = addNamespaceStatuses(mutConfig, "OS", ["deployed", "staging"]);
  check("added custom statuses", addedStatuses.length === 2);
  check("added includes deployed", addedStatuses.includes("deployed"));

  // Idempotent — adding again does nothing
  const addedAgain = addNamespaceStatuses(mutConfig, "OS", ["deployed"]);
  check("idempotent add returns empty", addedAgain.length === 0);

  // Skip if already a default
  const addedDefault = addNamespaceStatuses(mutConfig, "OS", ["backlog"]);
  check("skip default status", addedDefault.length === 0);

  // Resolve includes extensions
  const afterAdd = resolveSchema(mutConfig, "OS");
  check("resolved includes deployed", afterAdd.status.all.includes("deployed"));
  check("resolved includes staging", afterAdd.status.all.includes("staging"));
  check("extensions list has deployed", afterAdd.status.extensions.includes("deployed"));

  // Remove extension
  const removedStatuses = removeNamespaceStatuses(mutConfig, "OS", ["staging"]);
  check("removed staging", removedStatuses.includes("staging"));
  const afterRemove = resolveSchema(mutConfig, "OS");
  check("staging gone after remove", !afterRemove.status.all.includes("staging"));
  check("deployed still present", afterRemove.status.all.includes("deployed"));

  // Cannot remove default
  try {
    removeNamespaceStatuses(mutConfig, "OS", ["done"]);
    check("cannot remove default status", false, "should have thrown");
  } catch (e: any) {
    check("cannot remove default status", e.code === "VALIDATION_ERROR");
  }

  // 13. Schema mutation — artifact types
  console.log("\n13. Schema mutation — artifact types");
  const addedTypes = addNamespaceArtifactTypes(mutConfig, "OS", ["release-notes", "changelog"]);
  check("added artifact types", addedTypes.length === 2);

  // Idempotent
  const addedTypesAgain = addNamespaceArtifactTypes(mutConfig, "OS", ["release-notes"]);
  check("idempotent artifact type add", addedTypesAgain.length === 0);

  // Skip default
  const addedDefaultType = addNamespaceArtifactTypes(mutConfig, "OS", ["prd"]);
  check("skip default artifact type", addedDefaultType.length === 0);

  // Remove extension
  const removedTypes = removeNamespaceArtifactTypes(mutConfig, "OS", ["changelog"]);
  check("removed changelog", removedTypes.includes("changelog"));

  // Cannot remove default
  try {
    removeNamespaceArtifactTypes(mutConfig, "OS", ["prd"]);
    check("cannot remove default artifact type", false, "should have thrown");
  } catch (e: any) {
    check("cannot remove default artifact type", e.code === "VALIDATION_ERROR");
  }

  // Write mutated config so we can test filesystem adapter with it
  writeConfig(DATA_PATH, mutConfig);

  // 14. Validation with resolved schema
  console.log("\n14. Validation with resolved schema");
  const resolvedOS = resolveSchema(mutConfig, "OS");

  // Valid default status
  try {
    validateStatus("backlog", resolvedOS.status.all);
    check("valid default status passes", true);
  } catch {
    check("valid default status passes", false);
  }

  // Valid custom status
  try {
    validateStatus("deployed", resolvedOS.status.all);
    check("valid custom status passes", true);
  } catch {
    check("valid custom status passes", false);
  }

  // Invalid status with suggestion
  try {
    validateStatus("deplyed", resolvedOS.status.all);
    check("invalid status rejected", false, "should have thrown");
  } catch (e: any) {
    check("invalid status rejected", e.code === "VALIDATION_ERROR");
    check("error suggests closest match", e.message.includes("deployed"));
    check("error references wcp_schema", e.message.includes("wcp_schema"));
  }

  // Valid priority
  try {
    validatePriority("high", resolvedOS.priority.values);
    check("valid priority passes", true);
  } catch {
    check("valid priority passes", false);
  }

  // Invalid priority
  try {
    validatePriority("super", resolvedOS.priority.values);
    check("invalid priority rejected", false, "should have thrown");
  } catch (e: any) {
    check("invalid priority rejected", e.code === "VALIDATION_ERROR");
  }

  // Valid artifact type
  try {
    validateArtifactType("prd", resolvedOS.artifact_type.all);
    check("valid artifact type passes", true);
  } catch {
    check("valid artifact type passes", false);
  }

  // Custom artifact type
  try {
    validateArtifactType("release-notes", resolvedOS.artifact_type.all);
    check("custom artifact type passes", true);
  } catch {
    check("custom artifact type passes", false);
  }

  // Invalid artifact type with suggestion
  try {
    validateArtifactType("relaese-notes", resolvedOS.artifact_type.all);
    check("invalid artifact type rejected", false, "should have thrown");
  } catch (e: any) {
    check("invalid artifact type rejected", e.code === "VALIDATION_ERROR");
    check("artifact error suggests match", e.message.includes("release-notes"));
  }

  // 15. Create with custom status via filesystem adapter
  console.log("\n15. Create with custom status");
  const customId = await adapter.createItem("OS", {
    title: "Custom status test",
    status: "deployed",
  });
  const customItem = await adapter.getItem(customId);
  check("item created with custom status", customItem.status === "deployed");

  // 16. Attach with validated artifact type
  console.log("\n16. Attach with validated artifact type");
  await adapter.attachArtifact(customId, {
    type: "release-notes",
    title: "v1.0 Release Notes",
    filename: "release-notes.md",
    content: "# v1.0\n\nInitial release.",
  });
  const withCustomArtifact = await adapter.getItem(customId);
  check("custom artifact type attached", withCustomArtifact.artifacts.some(a => a.type === "release-notes"));

  // Invalid artifact type on attach
  try {
    await adapter.attachArtifact(customId, {
      type: "bogus-type",
      title: "Bad",
      filename: "bad.md",
      content: "nope",
    });
    check("invalid artifact type error on attach", false, "should have thrown");
  } catch (e: any) {
    check("invalid artifact type error on attach", e.code === "VALIDATION_ERROR");
  }

  // 17. Backward compatibility — config without schema key
  console.log("\n17. Backward compatibility");
  const bareConfig: WcpConfig = {
    namespaces: {
      TEST: { name: "Test", description: "Test namespace", next: 1 },
    },
  };
  const bareSchema = resolveSchema(bareConfig);
  check("bare config resolves defaults", bareSchema.status.defaults.length === DEFAULT_SCHEMA.status.length);
  check("bare config has default priorities", bareSchema.priority.values.length === DEFAULT_SCHEMA.priority.length);
  check("bare config has default artifact types", bareSchema.artifact_type.defaults.length === DEFAULT_SCHEMA.artifact_type.length);

  // 18. Cleanup — remove extensions from OS namespace config
  console.log("\n18. Cleanup");
  removeNamespaceStatuses(mutConfig, "OS", ["deployed"]);
  removeNamespaceArtifactTypes(mutConfig, "OS", ["release-notes"]);
  writeConfig(DATA_PATH, mutConfig);
  const cleanedSchema = resolveSchema(readConfig(DATA_PATH), "OS");
  check("cleanup removed extensions", cleanedSchema.status.extensions.length === 0);
  check("cleanup removed artifact extensions", cleanedSchema.artifact_type.extensions.length === 0);

  // Summary
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

smokeTest().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
