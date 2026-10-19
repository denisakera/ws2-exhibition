// Collected Q&A for the AI Console (web/index.html).
//
// The console front end (js/ai-console.js) is a protected control-plane file, so this
// companion module attaches the archive from the outside: every question the Ask box has
// sent, together with the answer recorded by the server, collected from /api/runs
// (tools/ai_console.py keeps the run records) and listed newest first. Ask and Q&A are one
// tab — the archive is injected into the Ask view, under the live conversation.
//
// Answers are long, so each archived entry shows a short preview and a "show full answer"
// toggle: several previous questions stay visible in the list at once, instead of one
// answer filling the box. style.css gives the live conversation above it a real, always
// scrollable height, so earlier exchanges stay reachable there too.
//
// All dynamic text is untrusted and inserted with textContent, never innerHTML.

const POLL_MS = 5000;
const PREVIEW_CHARS = 240; // answers longer than this collapse to a preview by default

const STATUS_TEXT = {
  queued: "queued",
  running: "running…",
  ok: "ok",
  "agent-error": "agent error",
  "process-error": "process error",
  timeout: "timed out",
  interrupted: "interrupted",
  "cli-missing": "agent CLI missing",
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function fmtTime(value) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
}

function fmtDuration(ms) {
  if (typeof ms !== "number") return "—";
  return ms < 1000 ? ms + "ms" : (ms / 1000).toFixed(1) + "s";
}

function statusText(status) {
  return STATUS_TEXT[status] || status || "unknown";
}

/** True for a run record that is a question: tagged Q&A, or an older untagged record
    carrying an `answer` (build runs never record one). */
function isQuestion(record) {
  if (!record) return false;
  if (record.kind === "qa") return true;
  return !record.kind && typeof record.answer === "string";
}

/** Question records with an answer (or an error) from /api/runs, newest first. */
export function qaRecords(runs) {
  return (Array.isArray(runs) ? runs : [])
    .filter((record) => isQuestion(record) && (record.text || record.answer))
    .sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
}

/** Short preview of a long answer, cut on a word boundary; null when it already fits. */
function previewOf(text) {
  if (typeof text !== "string" || text.length <= PREVIEW_CHARS) return null;
  let cut = text.slice(0, PREVIEW_CHARS);
  const space = cut.lastIndexOf(" ");
  if (space > PREVIEW_CHARS * 0.6) cut = cut.slice(0, space);
  return cut.trimEnd() + "…";
}

// Run ids whose archived answer the reader expanded — kept across the periodic refresh so
// a re-render does not collapse what you just opened.
const expandedIds = new Set();

function qaItem(record) {
  const box = el("div", "qa-hist-item");
  box.appendChild(el("div", "qa-hist-q", record.text || "(question)"));
  const ok = record.status === "ok";
  const pending = record.status === "queued" || record.status === "running";
  const answer = el("div", "qa-hist-a" + (ok || pending ? "" : " err"));
  let full;
  if (ok) {
    full = record.answer || record.resultText || "(no answer recorded)";
  } else if (pending) {
    full = "waiting for the answer…";
  } else {
    full = "answer failed (" + statusText(record.status) + ")";
    if (record.stderr) full += " — " + String(record.stderr).slice(0, 200);
  }
  const preview = previewOf(full);
  const body = el("span", "qa-hist-text", preview || full);
  answer.appendChild(body);
  if (preview) {
    const id = String(record.id || record.startedAt || "");
    let open = expandedIds.has(id);
    box.classList.toggle("open", open);
    const toggle = el("button", "qa-hist-more", open ? "collapse" : "show full answer");
    toggle.type = "button";
    toggle.title = "This answer is " + full.length + " characters long";
    toggle.setAttribute("aria-expanded", String(open));
    toggle.addEventListener("click", () => {
      open = !expandedIds.has(id);
      if (open) expandedIds.add(id);
      else expandedIds.delete(id);
      box.classList.toggle("open", open);
      body.textContent = open ? full : preview;
      toggle.textContent = open ? "collapse" : "show full answer";
      toggle.setAttribute("aria-expanded", String(open));
    });
    answer.appendChild(document.createTextNode(" "));
    answer.appendChild(toggle);
  }
  box.appendChild(answer);
  const bits = [];
  const time = fmtTime(record.startedAt);
  if (time) bits.push(time);
  if (typeof record.durationMs === "number") bits.push("answered in " + fmtDuration(record.durationMs));
  if (typeof record.costUsd === "number") bits.push("$" + record.costUsd.toFixed(4));
  if (bits.length) box.appendChild(el("div", "qa-hist-meta", bits.join(" · ")));
  return box;
}

/** Render the collected Q&A into ``listEl``; returns the number of entries shown. */
export function renderQaHistory(listEl, runs) {
  const keep = listEl.scrollTop;
  listEl.textContent = "";
  const records = qaRecords(runs);
  if (!records.length) {
    listEl.appendChild(el("p", "qa-hist-empty",
      "Nothing collected yet — ask a question and the answer will be archived here."));
    return 0;
  }
  records.forEach((record) => listEl.appendChild(qaItem(record)));
  listEl.scrollTop = keep;
  return records.length;
}

/** Attach the collected-Q&A archive to the console's Ask view (idempotent). */
export function attachQaTab(panel) {
  if (!panel || panel.querySelector("#qaHistList")) return;
  const askView = panel.querySelector("#viewAsk");
  const qaLog = panel.querySelector("#qaLog");
  if (!askView || !qaLog) return;

  const section = el("div", "qa-hist-section");
  section.id = "qaHistSection";

  const head = el("div", "qa-hist-head");
  const title = el("span", "qa-hist-title", "Collected Q&A");
  title.title = "Prior questions & answers from past Ask runs, newest first";
  head.appendChild(title);
  const status = el("span", "qa-hist-status", "loading…");
  status.id = "qaHistStatus";
  head.appendChild(status);
  const refresh = el("button", "qa-hist-refresh", "↻ refresh");
  refresh.type = "button";
  refresh.title = "Reload the collected questions & answers";
  refresh.addEventListener("click", () => load());
  head.appendChild(refresh);
  section.appendChild(head);

  const list = el("div", "qa-hist-list");
  list.id = "qaHistList";
  section.appendChild(list);

  askView.insertBefore(section, qaLog.nextSibling);

  let loading = false;

  function load() {
    if (loading) return;
    loading = true;
    status.textContent = "loading…";
    status.className = "qa-hist-status";
    fetch("/api/runs", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        loading = false;
        const count = renderQaHistory(list, body && body.runs);
        status.textContent = count
          ? count + (count === 1 ? " question collected" : " questions collected") + " · newest first"
          : "no questions collected yet";
        status.className = "qa-hist-status";
      })
      .catch(() => {
        loading = false;
        status.textContent = "console offline — run python3 tools/serve.py";
        status.className = "qa-hist-status err";
      });
  }

  load();
  setInterval(() => {
    if (askView.classList.contains("active") && panel.classList.contains("open")) load();
  }, POLL_MS);
}

function whenPanelReady(callback) {
  const panel = document.getElementById("aiConsole");
  if (panel) {
    callback(panel);
    return;
  }
  if (typeof MutationObserver === "function" && document.body) {
    const observer = new MutationObserver(() => {
      const found = document.getElementById("aiConsole");
      if (found) {
        observer.disconnect();
        callback(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return;
  }
  const timer = setInterval(() => {
    const found = document.getElementById("aiConsole");
    if (found) {
      clearInterval(timer);
      callback(found);
    }
  }, 1000);
}

export function initQaHistory() {
  if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
  whenPanelReady(attachQaTab);
}

initQaHistory();
