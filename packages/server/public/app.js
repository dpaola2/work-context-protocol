/* WCP Dashboard — Vanilla JS SPA */

const API = window.location.origin;
const INITIAL_ACTIVITY_COUNT = 10;

let currentView = { type: "namespaces" };
let eventSource = null;
let sseHasConnected = false;

// ── API helpers ──────────────────────────────────────────────────────────

function getApiKey() {
  return sessionStorage.getItem("wcp_api_key") || "";
}

function authHeaders() {
  const key = getApiKey();
  const headers = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = "Bearer " + key;
  return headers;
}

async function api(path) {
  const res = await fetch(API + path, { headers: authHeaders() });
  if (res.status === 401) {
    promptForApiKey();
    throw new Error("Unauthorized");
  }
  return res.json();
}

function promptForApiKey() {
  const key = prompt("API key required:");
  if (key) {
    sessionStorage.setItem("wcp_api_key", key);
    navigate(currentView);
  }
}

// ── Rendering helpers ────────────────────────────────────────────────────

function $(sel) { return document.querySelector(sel); }

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "dataset") {
        for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
      } else if (k.startsWith("on")) {
        el.addEventListener(k.slice(2), v);
      } else {
        el.setAttribute(k, v);
      }
    }
  }
  for (const child of children) {
    if (typeof child === "string") el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  }
  return el;
}

function renderMarkdown(text) {
  if (!text) return "";
  if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
    return DOMPurify.sanitize(marked.parse(text));
  }
  // Fallback: plain text in a <pre>
  const div = document.createElement("div");
  div.textContent = text;
  return "<pre>" + div.innerHTML + "</pre>";
}

function badge(type, value) {
  if (!value) return null;
  return h("span", { class: "badge badge-" + type, dataset: { value } }, value);
}

// ── Copy as markdown ─────────────────────────────────────────────────────

function itemToMarkdown(item) {
  const lines = ["---"];
  lines.push("id: " + item.id);
  lines.push("title: " + item.title);
  lines.push("status: " + item.status);
  if (item.priority) lines.push("priority: " + item.priority);
  if (item.type) lines.push("type: " + item.type);
  if (item.project) lines.push("project: " + item.project);
  if (item.assignee) lines.push("assignee: " + item.assignee);
  if (item.parent) lines.push("parent: " + item.parent);
  lines.push("created: " + item.created);
  lines.push("updated: " + item.updated);
  if (item.artifacts && item.artifacts.length > 0) {
    lines.push("artifacts:");
    for (const a of item.artifacts) {
      lines.push("  - type: " + a.type);
      lines.push("    title: " + a.title);
      lines.push("    url: " + a.url);
    }
  }
  lines.push("---");
  if (item.body) lines.push("", item.body);
  if (item.activity) lines.push("", "---activity---", "", item.activity);
  return lines.join("\n");
}

function copyItemAsMarkdown(item, btn) {
  const md = itemToMarkdown(item);
  navigator.clipboard.writeText(md).then(() => {
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove("copied");
    }, 1500);
  });
}

// ── Navigation ───────────────────────────────────────────────────────────

function viewToHash(view) {
  if (view.type === "namespaces") return "#/";
  if (view.type === "all-items") return "#/all";
  if (view.type === "items") return "#/" + view.namespace;
  if (view.type === "item") return "#/" + view.namespace + "/" + view.id;
  return "#/";
}

function hashToView(hash) {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { type: "namespaces" };
  if (parts[0] === "all") return { type: "all-items" };
  if (parts.length === 1) return { type: "items", namespace: parts[0] };
  return { type: "item", namespace: parts[0], id: parts[1] };
}

function navigate(view, { pushHistory = true } = {}) {
  currentView = view;

  if (pushHistory) {
    const newHash = viewToHash(view);
    if (window.location.hash !== newHash) {
      history.pushState(view, "", newHash);
    }
  }

  const bc = $("#breadcrumb");
  bc.innerHTML = "";

  if (view.type === "namespaces") {
    renderNamespaces();
  } else if (view.type === "all-items") {
    bc.appendChild(document.createTextNode(" / All Items"));
    renderAllItems(view.filters);
  } else if (view.type === "items") {
    bc.appendChild(document.createTextNode(" / "));
    const link = h("a", { href: "#", onclick: (e) => { e.preventDefault(); navigate({ type: "items", namespace: view.namespace }); } }, view.namespace);
    bc.appendChild(link);
    renderItems(view.namespace, view.filters);
  } else if (view.type === "item") {
    bc.appendChild(document.createTextNode(" / "));
    const nsLink = h("a", { href: "#", onclick: (e) => { e.preventDefault(); navigate({ type: "items", namespace: view.namespace }); } }, view.namespace);
    bc.appendChild(nsLink);
    bc.appendChild(document.createTextNode(" / " + view.id));
    renderItemDetail(view.id);
  }
}

// ── Namespace list view ──────────────────────────────────────────────────

async function renderNamespaces() {
  const app = $("#app");
  app.innerHTML = '<div class="loading">Loading namespaces...</div>';

  try {
    const data = await api("/api/namespaces");
    app.innerHTML = "";

    if (!data.namespaces || data.namespaces.length === 0) {
      app.appendChild(h("div", { class: "empty-state" },
        h("h3", null, "No namespaces yet"),
        h("p", null, "Create a namespace using the MCP tools to get started.")
      ));
      return;
    }

    // "All Items" link
    const allLink = h("a", {
      class: "all-items-link",
      href: "#",
      onclick: (e) => { e.preventDefault(); navigate({ type: "all-items" }); }
    }, "View all items across namespaces");
    app.appendChild(allLink);

    const list = h("div", { class: "namespace-list" });
    for (const ns of data.namespaces) {
      const card = h("a", {
        class: "namespace-card",
        href: "#",
        onclick: (e) => { e.preventDefault(); navigate({ type: "items", namespace: ns.key }); }
      },
        h("h3", null,
          h("span", { class: "key" }, ns.key),
          ns.name
        ),
        h("div", { class: "meta" },
          ns.description ? ns.description + " — " : "",
          ns.itemCount + " item" + (ns.itemCount !== 1 ? "s" : "")
        )
      );
      list.appendChild(card);
    }
    app.appendChild(list);
  } catch (err) {
    if (err.message !== "Unauthorized") {
      app.innerHTML = '<div class="empty-state"><h3>Failed to load</h3><p>' + err.message + "</p></div>";
    }
  }
}

// ── All items view (cross-namespace) ─────────────────────────────────────

async function renderAllItems(filters) {
  const app = $("#app");
  app.innerHTML = '<div class="loading">Loading all items...</div>';

  try {
    let query = "";
    if (filters) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v) params.set(k, v);
      }
      const qs = params.toString();
      if (qs) query = "?" + qs;
    }

    const data = await api("/api/items" + query);
    app.innerHTML = "";

    // Filter bar
    const bar = h("div", { class: "filter-bar" });
    const statusFilter = h("select", { onchange: () => applyAllItemsFilters() });
    statusFilter.id = "filter-status";
    statusFilter.appendChild(h("option", { value: "" }, "All statuses"));
    for (const s of ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]) {
      const opt = h("option", { value: s }, s);
      if (filters?.status === s) opt.selected = true;
      statusFilter.appendChild(opt);
    }

    const priorityFilter = h("select", { onchange: () => applyAllItemsFilters() });
    priorityFilter.id = "filter-priority";
    priorityFilter.appendChild(h("option", { value: "" }, "All priorities"));
    for (const p of ["urgent", "high", "medium", "low"]) {
      const opt = h("option", { value: p }, p);
      if (filters?.priority === p) opt.selected = true;
      priorityFilter.appendChild(opt);
    }

    const typeFilter = h("select", { onchange: () => applyAllItemsFilters() });
    typeFilter.id = "filter-type";
    typeFilter.appendChild(h("option", { value: "" }, "All types"));
    for (const t of ["feature", "bug", "chore", "spike"]) {
      const opt = h("option", { value: t }, t);
      if (filters?.type === t) opt.selected = true;
      typeFilter.appendChild(opt);
    }

    bar.appendChild(statusFilter);
    bar.appendChild(priorityFilter);
    bar.appendChild(typeFilter);
    app.appendChild(bar);

    if (!data.items || data.items.length === 0) {
      app.appendChild(h("div", { class: "empty-state" },
        h("h3", null, "No items"),
        h("p", null, filters ? "No items match the current filters." : "No work items exist yet.")
      ));
      return;
    }

    const list = h("div", { class: "item-list" });
    for (const item of data.items) {
      const ns = item.id.split("-")[0];
      const row = h("a", {
        class: "item-row",
        href: "#",
        onclick: (e) => { e.preventDefault(); navigate({ type: "item", id: item.id, namespace: ns }); }
      },
        h("span", { class: "callsign" }, item.id),
        h("span", { class: "title" }, item.title),
        badge("status", item.status),
        badge("priority", item.priority),
        h("span", { class: "date" }, item.updated)
      );
      list.appendChild(row);
    }
    app.appendChild(list);
  } catch (err) {
    if (err.message !== "Unauthorized") {
      app.innerHTML = '<div class="empty-state"><h3>Failed to load</h3><p>' + err.message + "</p></div>";
    }
  }
}

function applyAllItemsFilters() {
  const filters = {};
  const s = document.getElementById("filter-status");
  const p = document.getElementById("filter-priority");
  const t = document.getElementById("filter-type");
  if (s && s.value) filters.status = s.value;
  if (p && p.value) filters.priority = p.value;
  if (t && t.value) filters.type = t.value;
  navigate({ type: "all-items", filters: Object.keys(filters).length ? filters : undefined });
}

// ── Item list view ───────────────────────────────────────────────────────

async function renderItems(namespace, filters) {
  const app = $("#app");
  app.innerHTML = '<div class="loading">Loading items...</div>';

  try {
    let query = "";
    if (filters) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v) params.set(k, v);
      }
      const qs = params.toString();
      if (qs) query = "?" + qs;
    }

    const data = await api("/api/namespaces/" + namespace + "/items" + query);
    app.innerHTML = "";

    // Filter bar
    const bar = h("div", { class: "filter-bar" });
    const statusFilter = h("select", { onchange: () => applyFilters(namespace) });
    statusFilter.id = "filter-status";
    statusFilter.appendChild(h("option", { value: "" }, "All statuses"));
    for (const s of ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]) {
      const opt = h("option", { value: s }, s);
      if (filters?.status === s) opt.selected = true;
      statusFilter.appendChild(opt);
    }

    const priorityFilter = h("select", { onchange: () => applyFilters(namespace) });
    priorityFilter.id = "filter-priority";
    priorityFilter.appendChild(h("option", { value: "" }, "All priorities"));
    for (const p of ["urgent", "high", "medium", "low"]) {
      const opt = h("option", { value: p }, p);
      if (filters?.priority === p) opt.selected = true;
      priorityFilter.appendChild(opt);
    }

    const typeFilter = h("select", { onchange: () => applyFilters(namespace) });
    typeFilter.id = "filter-type";
    typeFilter.appendChild(h("option", { value: "" }, "All types"));
    for (const t of ["feature", "bug", "chore", "spike"]) {
      const opt = h("option", { value: t }, t);
      if (filters?.type === t) opt.selected = true;
      typeFilter.appendChild(opt);
    }

    bar.appendChild(statusFilter);
    bar.appendChild(priorityFilter);
    bar.appendChild(typeFilter);
    app.appendChild(bar);

    if (!data.items || data.items.length === 0) {
      app.appendChild(h("div", { class: "empty-state" },
        h("h3", null, "No items"),
        h("p", null, filters ? "No items match the current filters." : "This namespace has no work items yet.")
      ));
      return;
    }

    const list = h("div", { class: "item-list" });
    for (const item of data.items) {
      const ns = item.id.split("-")[0];
      const row = h("a", {
        class: "item-row",
        href: "#",
        onclick: (e) => { e.preventDefault(); navigate({ type: "item", id: item.id, namespace: ns }); }
      },
        h("span", { class: "callsign" }, item.id),
        h("span", { class: "title" }, item.title),
        badge("status", item.status),
        badge("priority", item.priority),
        h("span", { class: "date" }, item.updated)
      );
      list.appendChild(row);
    }
    app.appendChild(list);
  } catch (err) {
    if (err.message !== "Unauthorized") {
      app.innerHTML = '<div class="empty-state"><h3>Failed to load</h3><p>' + err.message + "</p></div>";
    }
  }
}

function applyFilters(namespace) {
  const filters = {};
  const s = document.getElementById("filter-status");
  const p = document.getElementById("filter-priority");
  const t = document.getElementById("filter-type");
  if (s && s.value) filters.status = s.value;
  if (p && p.value) filters.priority = p.value;
  if (t && t.value) filters.type = t.value;
  navigate({ type: "items", namespace, filters: Object.keys(filters).length ? filters : undefined });
}

// ── Item detail view ─────────────────────────────────────────────────────

async function renderItemDetail(id) {
  const app = $("#app");
  app.innerHTML = '<div class="loading">Loading item...</div>';

  try {
    const data = await api("/api/items/" + id);
    const item = data.item;

    const detail = h("div", { class: "item-detail" });
    detail.appendChild(h("h2", null, item.title));

    const meta = h("div", { class: "meta-row" },
      h("span", { class: "callsign", style: "font-family: var(--mono); font-weight: 600; color: var(--accent);" }, item.id),
      badge("status", item.status),
      badge("priority", item.priority),
      badge("type", item.type)
    );
    if (item.assignee) meta.appendChild(h("span", null, "Assignee: " + item.assignee));
    if (item.project) meta.appendChild(h("span", null, "Project: " + item.project));
    meta.appendChild(h("span", { style: "color: var(--text-secondary); font-size: 12px;" }, "Created " + item.created + " · Updated " + item.updated));
    const copyBtn = h("button", {
      class: "copy-btn",
      onclick: () => copyItemAsMarkdown(item, copyBtn),
    }, "Copy");
    meta.appendChild(copyBtn);
    detail.appendChild(meta);

    // Body
    if (item.body) {
      const bodyDiv = h("div", { class: "body" });
      bodyDiv.innerHTML = renderMarkdown(item.body);
      detail.appendChild(bodyDiv);
    } else {
      detail.appendChild(h("div", { class: "body empty-state", style: "padding: 16px 0; border-top: 1px solid var(--border);" },
        h("p", null, "No description.")
      ));
    }

    // Artifacts
    if (item.artifacts && item.artifacts.length > 0) {
      const artSection = h("div", { class: "artifacts-section" });
      artSection.appendChild(h("h3", null, "Artifacts"));
      const contentCache = {};
      for (const art of item.artifacts) {
        const wrapper = h("div", { class: "artifact-wrapper" });
        const chevron = h("span", { class: "artifact-chevron" }, "\u25b6");
        const header = h("div", { class: "artifact-item-clickable" },
          chevron,
          h("span", { class: "artifact-type" }, art.type),
          h("span", null, art.title)
        );
        const contentDiv = h("div", { class: "artifact-content" });
        contentDiv.style.display = "none";

        header.addEventListener("click", async () => {
          const isOpen = contentDiv.style.display !== "none";
          if (isOpen) {
            contentDiv.style.display = "none";
            chevron.textContent = "\u25b6";
            return;
          }
          // Fetch if not cached
          const filename = art.url.split("/").pop();
          if (!contentCache[filename]) {
            contentDiv.innerHTML = '<div class="loading" style="padding: 12px 0;">Loading...</div>';
            contentDiv.style.display = "block";
            chevron.textContent = "\u25bc";
            try {
              const data = await api("/api/items/" + id + "/artifacts/" + filename);
              contentCache[filename] = data.content;
            } catch (err) {
              contentDiv.innerHTML = '<div class="empty-state" style="padding: 12px 0;"><p>Failed to load artifact.</p></div>';
              return;
            }
          }
          contentDiv.innerHTML = renderMarkdown(contentCache[filename]);
          contentDiv.style.display = "block";
          chevron.textContent = "\u25bc";
        });

        wrapper.appendChild(header);
        wrapper.appendChild(contentDiv);
        artSection.appendChild(wrapper);
      }
      detail.appendChild(artSection);
    }

    // Activity log
    const actSection = h("div", { class: "activity-section" });
    actSection.appendChild(h("h3", null, "Activity"));

    if (item.activity) {
      const entries = item.activity.split("\n\n").filter(Boolean);
      const total = entries.length;
      let showing = INITIAL_ACTIVITY_COUNT;

      function renderActivityEntries(count) {
        // Clear existing entries (keep the h3)
        while (actSection.childNodes.length > 1) {
          actSection.removeChild(actSection.lastChild);
        }

        // Show most recent entries (from end)
        const start = Math.max(0, total - count);
        const visible = entries.slice(start);

        for (const entry of visible) {
          const lines = entry.split("\n");
          const header = lines[0] || "";
          const body = lines.slice(1).join("\n");

          // Parse "**author** — timestamp"
          const match = header.match(/^\*\*(.+?)\*\*\s*—\s*(.+)$/);
          const entryEl = h("div", { class: "activity-entry" });
          if (match) {
            entryEl.appendChild(h("span", { class: "author" }, match[1]));
            entryEl.appendChild(h("span", { class: "timestamp" }, match[2]));
          } else {
            entryEl.appendChild(h("span", null, header));
          }
          if (body.trim()) {
            const bodyEl = h("div", { class: "entry-body" });
            bodyEl.textContent = body.trim();
            entryEl.appendChild(bodyEl);
          }
          actSection.appendChild(entryEl);
        }

        if (start > 0) {
          const btn = h("button", {
            class: "load-more-btn",
            onclick: () => {
              showing = Math.min(total, showing + INITIAL_ACTIVITY_COUNT);
              renderActivityEntries(showing);
            }
          }, "Load " + Math.min(INITIAL_ACTIVITY_COUNT, start) + " more...");
          actSection.appendChild(btn);
        }
      }

      renderActivityEntries(showing);
    } else {
      actSection.appendChild(h("div", { class: "empty-state", style: "padding: 16px 0;" },
        h("p", null, "No activity yet.")
      ));
    }

    detail.appendChild(actSection);
    app.innerHTML = "";
    app.appendChild(detail);
  } catch (err) {
    if (err.message !== "Unauthorized") {
      app.innerHTML = '<div class="empty-state"><h3>Failed to load</h3><p>' + err.message + "</p></div>";
    }
  }
}

// ── SSE live updates ─────────────────────────────────────────────────────

function connectSSE() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }

  const key = getApiKey();
  const url = key
    ? API + "/api/events?token=" + encodeURIComponent(key)
    : API + "/api/events";

  eventSource = new EventSource(url);

  eventSource.onopen = () => {
    const dot = $("#connection-status");
    dot.className = "status-dot connected";
    dot.title = "Connected";

    // On reconnect (not first connection), refetch current view to catch up on missed events
    if (sseHasConnected) {
      navigate(currentView);
    }
    sseHasConnected = true;
  };

  eventSource.onerror = () => {
    const dot = $("#connection-status");
    dot.className = "status-dot disconnected";
    dot.title = "Reconnecting...";
  };

  // Refetch current view data on any mutation event
  const refetch = () => navigate(currentView);

  eventSource.addEventListener("item_created", refetch);
  eventSource.addEventListener("item_updated", refetch);
  eventSource.addEventListener("namespace_created", refetch);
  eventSource.addEventListener("namespace_updated", refetch);
  eventSource.addEventListener("schema_updated", refetch);
}

// ── Init ─────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Wire up brand/logo link to go home
  const brand = $(".brand");
  if (brand) {
    brand.addEventListener("click", (e) => {
      e.preventDefault();
      navigate({ type: "namespaces" });
    });
  }

  // Handle browser back/forward buttons
  window.addEventListener("popstate", (e) => {
    const view = e.state || hashToView(window.location.hash);
    navigate(view, { pushHistory: false });
  });

  // Restore view from URL hash on load, or default to namespaces
  const initialView = window.location.hash
    ? hashToView(window.location.hash)
    : { type: "namespaces" };
  navigate(initialView, { pushHistory: false });
  history.replaceState(initialView, "", viewToHash(initialView));

  connectSSE();
});
