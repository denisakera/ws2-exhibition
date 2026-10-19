// AI Console panel for the WS₂ reservoir replica (web/index.html).
//
// Self-contained: injects the toggle button, the panel and its styles, then talks to the
// same-origin /api/* routes served by tools/serve.py (tools/ai_console.py). Two modes:
//
//   Ask   — post a question to /api/ask; a read-only agent answers it grounded in the repo.
//   Build — post an instruction to /api/instruction; a scoped agent edits web/** + docs/*.md,
//           the result is health-checked and snapshotted (revertable) or rolled back.
//
// Keys: Ctrl+Shift+L toggles the panel, Esc closes it. Ctrl+Enter sends.
// All dynamic text is untrusted and inserted with textContent, never innerHTML.

const POLL_MS = 5000;
const ASK_POLL_MS = 2000;

const RUN_STATUS_TEXT = {
  queued: "queued",
  running: "running…",
  ok: "ok",
  "no-changes": "no changes",
  unhealthy: "unhealthy — result rolled back",
  "out-of-scope": "not applied — edited files outside the allowlist",
  "agent-error": "agent error",
  "process-error": "process error",
  timeout: "timed out",
  interrupted: "interrupted — serve.py restarted, nothing applied",
  "cli-missing": "agent CLI missing",
};

const CSS = `
#aiToggle{position:fixed;top:10px;right:12px;z-index:46;width:38px;height:38px;padding:0;border-radius:50%;
  display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;cursor:pointer;
  color:var(--text);background:var(--panel);border:1px solid var(--line);
  box-shadow:0 4px 16px rgba(0,0,0,.45);transition:transform .15s ease,opacity .15s ease,border-color .15s ease}
#aiToggle:hover{transform:scale(1.08);border-color:var(--accent)}
#aiToggle.ac-offline{opacity:.45}
#aiToggle .ac-ant{width:26px;height:26px;object-fit:contain;pointer-events:none;-webkit-user-drag:none;user-select:none}
#aiConsole{position:fixed;top:0;right:0;bottom:0;z-index:45;width:min(390px,94vw);display:flex;flex-direction:column;
  gap:10px;padding:16px;overflow-y:auto;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;
  color:var(--text);background:var(--panel);border-left:1px solid var(--line);
  box-shadow:-10px 0 34px rgba(0,0,0,.55);transform:translateX(105%);transition:transform .22s cubic-bezier(.2,.8,.25,1)}
#aiConsole.open{transform:translateX(0)}
.ac-head{display:flex;align-items:center;gap:9px}
.ac-head h3{flex:1;margin:0;font-size:13px;font-weight:600;letter-spacing:.02em}
.ac-dot{width:8px;height:8px;border-radius:50%;background:var(--bad);box-shadow:0 0 6px rgba(225,87,89,.7);flex:none}
.ac-dot.on{background:var(--good);box-shadow:0 0 6px rgba(89,201,143,.8)}
.ac-doc{flex:none;display:flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;
  border:1px solid var(--line);color:var(--dim);font-size:10.5px;font-weight:700;line-height:1;text-decoration:none}
.ac-doc:hover{color:var(--accent);border-color:var(--accent)}
.ac-close{background:none;border:none;color:var(--dim);font-size:18px;line-height:1;cursor:pointer;padding:0 4px}
.ac-close:hover{color:var(--text)}
.ac-modes{display:flex;gap:4px}
.ac-modes button{flex:1;padding:6px 0;font:600 12px/1 ui-monospace,monospace;color:var(--dim);
  background:transparent;border:1px solid var(--line);border-radius:6px;cursor:pointer}
.ac-modes button.active{color:var(--text);border-color:var(--accent);background:#17283a}
.ac-hint{margin:0;font-size:11px;line-height:1.5;color:var(--dim)}
.ac-hint code{color:#9fd8ff;background:transparent;padding:0}
#qaLog{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:2px}
.qa-q{align-self:flex-end;max-width:86%;padding:7px 10px;border-radius:10px 10px 2px 10px;background:#17283a;color:var(--text)}
.qa-a{align-self:flex-start;max-width:94%;padding:8px 10px;border-radius:10px 10px 10px 2px;background:#0b0f14;border:1px solid var(--line);
  white-space:pre-wrap;word-break:break-word;line-height:1.55}
.qa-a.thinking{color:var(--dim);font-style:italic}
.qa-a.err{color:var(--bad)}
.qa-a .meta{display:block;margin-top:6px;font-size:10px;color:var(--dim)}
#qaInput{min-height:38px;max-height:24vh;resize:vertical;box-sizing:border-box;width:100%;padding:8px 10px;
  font:12px/1.5 ui-monospace,monospace;color:var(--text);background:#0b0f14;border:1px solid var(--line);border-radius:6px;outline:none}
#qaInput:focus,#acInput:focus{border-color:var(--accent);box-shadow:0 0 0 2px rgba(87,199,255,.12)}
#acInput{min-height:92px;max-height:38vh;resize:vertical;box-sizing:border-box;width:100%;padding:9px 10px;
  font:12px/1.5 ui-monospace,monospace;color:var(--text);background:#0b0f14;border:1px solid var(--line);border-radius:6px;outline:none}
.ac-row{display:flex;align-items:center;gap:10px}
.ac-kbd{font-size:10.5px;color:var(--dim)}
.ac-send{margin-left:auto;padding:6px 12px;font:600 12px/1 ui-monospace,monospace;color:#0b140d;background:var(--good);border:none;border-radius:6px;cursor:pointer}
.ac-send:disabled{opacity:.45;cursor:default}
.ac-state{font-size:11px;min-height:15px;color:var(--dim)}
.ac-state.ok{color:var(--good)}
.ac-state.err{color:var(--bad)}
.ac-health{padding:8px 10px;font-size:11px;line-height:1.5;color:var(--dim);background:#0b0f14;border:1px solid var(--line);border-radius:6px}
.ac-health.bad{border-color:rgba(225,87,89,.6);color:var(--bad)}
.ac-health.warn{border-color:rgba(255,180,84,.5);color:var(--accent2)}
.ac-health button{margin-left:6px;padding:2px 8px;font:11px/1.3 ui-monospace,monospace;color:inherit;background:none;border:1px solid currentColor;border-radius:5px;cursor:pointer}
.ac-health button:hover{background:rgba(255,255,255,.08)}
.ac-reload{display:none;align-items:center;gap:8px;padding:8px 10px;font-size:11px;color:var(--good);border:1px dashed rgba(89,201,143,.4);border-radius:6px}
.ac-reload.show{display:flex}
.ac-reload button{margin-left:auto;padding:3px 9px;font:600 11px/1.3 ui-monospace,monospace;color:#0b140d;background:var(--good);border:none;border-radius:5px;cursor:pointer}
.ac-history h4{margin:8px 0 0;font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.ac-history ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
.ac-history li{font-size:11px;color:var(--dim);background:#0b0f14;border:1px solid var(--line);border-radius:5px}
.ac-history li .row{display:flex;align-items:center;gap:7px;padding:5px 8px;cursor:pointer}
.ac-history li .row:hover{background:rgba(255,255,255,.05)}
.ac-history .badge{flex:none;padding:1px 6px;font-size:9px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;border-radius:999px}
.ac-history .badge.queued,.ac-history .badge.running,.ac-history .badge.interrupted{color:var(--accent2);background:rgba(255,180,84,.14)}
.ac-history .badge.ok{color:var(--good);background:rgba(89,201,143,.14)}
.ac-history .badge.no-changes,.ac-history .badge.commit{color:var(--dim);background:rgba(255,255,255,.08)}
.ac-history .badge.revert,.ac-history .badge.restore{color:#9fd8ff;background:rgba(159,216,255,.14)}
.ac-history .badge.unhealthy,.ac-history .badge.agent-error,.ac-history .badge.process-error,.ac-history .badge.timeout,
.ac-history .badge.cli-missing,.ac-history .badge.out-of-scope{color:var(--bad);background:rgba(225,87,89,.14)}
.ac-history .txt{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
.ac-history .t{flex:none;color:var(--dim)}
.ac-history .empty{font-size:10.5px;color:var(--dim)}
.ac-detail{display:none;padding:8px 10px;border-top:1px solid var(--line);white-space:pre-wrap;word-break:break-word;font-size:10.5px;line-height:1.6}
.ac-detail.open{display:block}
.ac-detail .k{color:var(--dim)}
.ac-detail .err{color:var(--bad)}
.ac-revert,.ac-retry{padding:1px 7px;font-size:10.5px;color:var(--dim);background:none;border:1px solid var(--line);border-radius:4px;cursor:pointer;margin-top:6px}
.ac-revert:hover{color:var(--accent2);border-color:var(--accent2)}
.ac-retry:hover{color:var(--good);border-color:var(--good)}
.ac-ref{flex:none;padding:0 6px;font:700 11px/1.5 ui-monospace,monospace;color:var(--dim);background:none;border:1px solid var(--line);border-radius:4px;cursor:pointer}
.ac-ref:hover{color:var(--accent);border-color:var(--accent)}
.ac-view{display:none}
.ac-view.active{display:flex;flex-direction:column;gap:10px}
`;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
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

function mount() {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const toggle = node("button");
  toggle.id = "aiToggle";
  toggle.type = "button";
  toggle.title = "AI Console — Ctrl+Shift+L";
  toggle.setAttribute("aria-label", "Toggle AI Console");
  const ant = document.createElement("img");
  ant.className = "ac-ant";
  ant.src = "/assets/console-ant.png"; // document-relative: /index.html -> /assets/
  ant.alt = "";
  ant.setAttribute("aria-hidden", "true");
  ant.draggable = false;
  toggle.appendChild(ant);

  const panel = document.createElement("aside");
  panel.id = "aiConsole";
  panel.setAttribute("aria-label", "AI Console");
  panel.innerHTML = [
    '<div class="ac-head">',
    "<h3>🪄 AI Console</h3>",
    '<span class="ac-dot" id="acDot"></span>',
    '<button class="ac-close" id="acClose" type="button" title="Close (Esc)" aria-label="Close">×</button>',
    "</div>",
    '<div class="ac-modes">',
    '<button id="modeAsk" type="button" class="active">Ask</button>',
    '<button id="modeBuild" type="button">Build</button>',
    "</div>",
    '<div class="ac-view active" id="viewAsk">',
    '<p class="ac-hint">Ask a question about the setup, the paper, or this replica. A read-only agent answers grounded in <code>docs/</code> and the <code>web/js/</code> source.</p>',
    '<div id="qaLog"></div>',
    '<textarea id="qaInput" placeholder="e.g. can I use an ADS1115 in place of the TIA?"></textarea>',
    '<div class="ac-row"><span class="ac-kbd">Ctrl+Enter to ask</span>',
    '<button class="ac-send" id="qaSend" type="button">Ask</button></div>',
    "</div>",
    '<div class="ac-view" id="viewBuild">',
    '<p class="ac-hint">Tell the AI what to build or change in this page. It edits <code>web/**</code> + <code>docs/*.md</code>, and every change is snapshotted and revertable. Click <b>++</b> on a past run to reference it.</p>',
    '<textarea id="acInput" placeholder="e.g. add a \u2018dark mode\u2019 toggle, or update docs/SETUP.md\u2019s FAQ\u2026"></textarea>',
    '<div class="ac-row"><span class="ac-kbd">Ctrl+Enter to send</span>',
    '<button class="ac-send" id="acSend" type="button">Send to AI ✨</button></div>',
    '<div class="ac-state" id="acState">console offline — run python3 tools/serve.py</div>',
    '<div class="ac-health" id="acHealth">waiting for serve.py…</div>',
    '<div class="ac-reload" id="acReload"><span>🚀 New version of this page is on disk.</span>',
    '<button id="acReloadBtn" type="button">Reload ↻</button></div>',
    '<div class="ac-history"><h4>Runs</h4><ul id="runList"></ul></div>',
    '<div class="ac-history"><h4>Snapshots</h4><ul id="commitList"></ul></div>',
    "</div>",
  ].join("\n");

  document.body.appendChild(toggle);
  document.body.appendChild(panel);

  const dot = document.getElementById("acDot");
  const qaInput = document.getElementById("qaInput");
  const qaSend = document.getElementById("qaSend");
  const qaLog = document.getElementById("qaLog");
  const acInput = document.getElementById("acInput");
  const acSend = document.getElementById("acSend");
  const stateEl = document.getElementById("acState");
  const healthEl = document.getElementById("acHealth");
  const reloadWrap = document.getElementById("acReload");
  const runList = document.getElementById("runList");
  const commitList = document.getElementById("commitList");

  function openPanel() {
    panel.classList.add("open");
    setTimeout(() => (document.getElementById("modeAsk").classList.contains("active") ? qaInput : acInput).focus(), 240);
  }
  function closePanel() {
    panel.classList.remove("open");
    qaInput.blur();
    acInput.blur();
  }
  function togglePanel() {
    panel.classList.contains("open") ? closePanel() : openPanel();
  }

  toggle.addEventListener("click", togglePanel);
  document.getElementById("acClose").addEventListener("click", closePanel);
  document.getElementById("acReloadBtn").addEventListener("click", () => location.reload());

  ["keydown", "keyup", "keypress"].forEach((type) => {
    panel.addEventListener(type, (event) => event.stopPropagation());
  });
  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === "L" || event.key === "l")) {
      event.preventDefault();
      event.stopPropagation();
      togglePanel();
      return;
    }
    if (event.key === "Escape" && panel.classList.contains("open")) closePanel();
  }, true);

  // --- mode switch ------------------------------------------------------

  function switchMode(mode) {
    document.getElementById("modeAsk").classList.toggle("active", mode === "ask");
    document.getElementById("modeBuild").classList.toggle("active", mode === "build");
    document.getElementById("viewAsk").classList.toggle("active", mode === "ask");
    document.getElementById("viewBuild").classList.toggle("active", mode === "build");
    if (mode === "ask") qaInput.focus();
    else acInput.focus();
  }
  document.getElementById("modeAsk").addEventListener("click", () => switchMode("ask"));
  document.getElementById("modeBuild").addEventListener("click", () => switchMode("build"));

  function setState(message, className) {
    stateEl.textContent = message;
    stateEl.className = "ac-state" + (className ? " " + className : "");
  }

  function showReload() {
    reloadWrap.classList.add("show");
  }

  function renderHealth(kind, message, withRestore) {
    healthEl.textContent = "";
    healthEl.classList.toggle("bad", kind === "bad");
    healthEl.classList.toggle("warn", kind === "warn");
    healthEl.appendChild(node("span", null, message));
    if (withRestore) {
      const button = node("button", null, "restore last good");
      button.type = "button";
      button.addEventListener("click", restoreLastGood);
      healthEl.appendChild(button);
    }
  }

  function restoreLastGood() {
    fetch("/api/restore", { method: "POST" })
      .then((response) => response.json())
      .then((body) => {
        if (body.ok) {
          setState("restored last known-good version", "ok");
          showReload();
        } else {
          setState((body && body.error) || "restore failed", "err");
        }
      })
      .catch(() => setState("restore failed — console offline", "err"));
  }

  // --- Ask mode ---------------------------------------------------------

  function appendQa(q, a, className, meta) {
    const qEl = node("div", "qa-q", q);
    qaLog.appendChild(qEl);
    const aEl = node("div", "qa-a" + (className ? " " + className : ""), a);
    if (meta) aEl.appendChild(node("span", "meta", meta));
    qaLog.appendChild(aEl);
    qaLog.scrollTop = qaLog.scrollHeight;
    return aEl;
  }

  function ask() {
    const text = qaInput.value.trim();
    if (!text) return;
    qaSend.disabled = true;
    qaInput.value = "";
    const aEl = appendQa(text, "thinking…", "thinking");
    fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((response) => response.json().then((body) => ({ ok: response.ok, body })))
      .then((result) => {
        qaSend.disabled = false;
        if (!result.ok) {
          aEl.textContent = "";
          aEl.classList.remove("thinking");
          aEl.classList.add("err");
          aEl.textContent = (result.body && result.body.error) || "ask failed";
          return;
        }
        pollQa(result.body.runId, aEl);
      })
      .catch(() => {
        qaSend.disabled = false;
        aEl.textContent = "";
        aEl.classList.remove("thinking");
        aEl.classList.add("err");
        aEl.textContent = "console offline — run python3 tools/serve.py";
      });
  }

  function pollQa(runId, aEl) {
    fetch("/api/run?id=" + encodeURIComponent(runId), { cache: "no-store" })
      .then((response) => response.json())
      .then((record) => {
        if (!record.finishedAt) {
          setTimeout(() => pollQa(runId, aEl), ASK_POLL_MS);
          return;
        }
        aEl.classList.remove("thinking");
        if (record.status === "ok") {
          aEl.textContent = record.answer || "(no answer)";
          aEl.appendChild(node("span", "meta", "answered in " + fmtDuration(record.durationMs)));
        } else {
          aEl.classList.add("err");
          aEl.textContent = "answer failed (" + (RUN_STATUS_TEXT[record.status] || record.status) + ")";
          if (record.stderr) aEl.appendChild(node("span", "meta", record.stderr.slice(0, 400)));
        }
        qaLog.scrollTop = qaLog.scrollHeight;
      })
      .catch(() => setTimeout(() => pollQa(runId, aEl), ASK_POLL_MS));
  }

  qaSend.addEventListener("click", ask);
  qaInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      ask();
    }
  });

  // --- Build mode -------------------------------------------------------

  let runsCache = {};
  const runsOrder = [];
  const commitsCache = [];
  const openFolds = new Set();

  function noteText(entry) {
    return typeof entry.note === "string" ? entry.note.trim() : "";
  }

  function consoleAction(entry) {
    const note = noteText(entry);
    if (note.indexOf("reverted to ") === 0) return "revert";
    if (note === "restored last-known-good") return "restore";
    return null;
  }

  function isRevertable(entry) {
    return Boolean(entry && entry.runId);
  }

  function revertButton(entry) {
    const button = node("button", "ac-revert", "↩ revert");
    button.type = "button";
    button.title = "Revert to this snapshot";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      fetch("/api/revert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: entry.id }),
      })
        .then((response) => response.json())
        .then((body) => {
          if (body.ok) {
            setState("reverted → " + body.entry.id, "ok");
            showReload();
          } else {
            setState((body && body.error) || "revert failed", "err");
          }
        })
        .catch(() => setState("revert failed — console offline", "err"));
    });
    return button;
  }

  const RETRYABLE_STATUSES = ["interrupted", "timeout", "unhealthy", "out-of-scope",
    "process-error", "cli-missing", "agent-error"];

  function retryButton(record) {
    const button = node("button", "ac-retry", "↻ run again");
    button.type = "button";
    button.title = "Submit this instruction again";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      button.disabled = true;
      sendInstruction(record.instruction).finally(() => { button.disabled = false; });
    });
    return button;
  }

  function referenceButton(runId) {
    const button = node("button", "ac-ref", "++");
    button.type = "button";
    button.title = "Prepend \u201ccontinue of " + runId + "\u201d to the instruction";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const token = "continue of " + runId;
      if (acInput.value.indexOf(token) < 0) acInput.value = token + " " + acInput.value;
      acInput.focus();
    });
    return button;
  }

  function fillRunDetail(box, record) {
    box.textContent = "";
    function row(label, value) {
      const line = document.createElement("div");
      line.appendChild(node("span", "k", label + ": "));
      line.appendChild(document.createTextNode(value == null ? "" : String(value)));
      box.appendChild(line);
    }
    row("instruction", record.instruction);
    row("run", record.id);
    row("status", RUN_STATUS_TEXT[record.status] || record.status);
    row("duration", fmtDuration(record.durationMs));
    if (record.costUsd != null) row("cost", "$" + record.costUsd.toFixed(4));
    if (record.applied) row("snapshot", record.applied);
    (record.changedFiles || []).forEach((f) => row("changed", f));
    (record.outOfScope || []).forEach((f) => row("out of scope", f));
    (record.problems || []).forEach((problem) => {
      const line = document.createElement("div");
      line.className = "err";
      line.appendChild(node("span", "k", "problem: "));
      line.appendChild(document.createTextNode(problem));
      box.appendChild(line);
    });
    if (record.resultText) row("result", record.resultText.slice(0, 2000));
    if (record.stderr) {
      const line = document.createElement("div");
      line.className = "err";
      line.appendChild(node("span", "k", "stderr: "));
      line.appendChild(document.createTextNode(record.stderr.slice(0, 2000)));
      box.appendChild(line);
    }
    if (record.applied) {
      const entry = commitsCache.find((c) => c.id === record.applied);
      if (entry && isRevertable(entry)) box.appendChild(revertButton(entry));
    }
    if (RETRYABLE_STATUSES.indexOf(record.status) >= 0 && record.instruction) {
      box.appendChild(retryButton(record));
    }
  }

  function runLi(record) {
    const li = document.createElement("li");
    const row = node("div", "row");
    row.appendChild(node("span", "badge " + record.status, record.status));
    row.appendChild(node("span", "txt", record.instruction || "(question)"));
    row.appendChild(node("span", "t", fmtTime(record.startedAt)));
    row.appendChild(referenceButton(record.id));
    const detail = node("div", "ac-detail");
    const key = "run:" + record.id;
    if (openFolds.has(key)) {
      detail.classList.add("open");
      fillRunDetail(detail, record);
    }
    row.addEventListener("click", () => {
      const open = detail.classList.toggle("open");
      if (open) {
        openFolds.add(key);
        fillRunDetail(detail, runsCache[record.id] || record);
      } else {
        openFolds.delete(key);
      }
    });
    li.appendChild(row);
    li.appendChild(detail);
    return li;
  }

  function commitLi(entry) {
    const li = document.createElement("li");
    const row = node("div", "row");
    const action = consoleAction(entry);
    row.appendChild(node("span", "badge " + (action || "commit"), action || "commit"));
    const text = action ? noteText(entry) : noteText(entry) || entry.id;
    row.appendChild(node("span", "txt", text));
    row.appendChild(node("span", "t", fmtTime(entry.time)));
    if (entry.runId) row.appendChild(referenceButton(entry.runId));
    const detail = node("div", "ac-detail");
    detail.textContent = "";
    function fill() {
      detail.textContent = "";
      const id = node("span", "k", "id: ");
      detail.appendChild(id);
      detail.appendChild(document.createTextNode(entry.id));
      if (entry.runId) {
        detail.appendChild(document.createTextNode("\nrun: " + entry.runId));
      }
      if (isRevertable(entry)) {
        const wrap = document.createElement("div");
        wrap.appendChild(revertButton(entry));
        detail.appendChild(wrap);
      } else {
        detail.appendChild(document.createTextNode("\nnot revertable — no AI run produced this snapshot"));
      }
    }
    const key = "commit:" + entry.id;
    if (openFolds.has(key)) {
      detail.classList.add("open");
      fill();
    }
    row.addEventListener("click", () => {
      const open = detail.classList.toggle("open");
      if (open) {
        openFolds.add(key);
        fill();
      } else {
        openFolds.delete(key);
      }
    });
    li.appendChild(row);
    li.appendChild(detail);
    return li;
  }

  function renderHistory() {
    runList.textContent = "";
    commitList.textContent = "";
    if (!runsOrder.length) runList.appendChild(node("span", "empty", "no submissions yet"));
    runsOrder.forEach((id) => {
      if (runsCache[id]) runList.appendChild(runLi(runsCache[id]));
    });
    if (!commitsCache.length) commitList.appendChild(node("span", "empty", "no snapshots yet"));
    commitsCache.forEach((entry) => commitList.appendChild(commitLi(entry)));
  }

  function sendInstruction(text) {
    acSend.disabled = true;
    return fetch("/api/instruction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((response) => response.json().then((body) => ({ ok: response.ok, body })))
      .then((result) => {
        acSend.disabled = false;
        if (result.ok) {
          acInput.value = "";
          setState("✨ sent — the AI is on it. New snapshots show below.", "ok");
        } else {
          setState((result.body && result.body.error) || "send failed", "err");
        }
      })
      .catch(() => {
        acSend.disabled = false;
        setState("console offline — run python3 tools/serve.py", "err");
      });
  }

  acSend.addEventListener("click", () => {
    const text = acInput.value.trim();
    if (text) sendInstruction(text);
  });
  acInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      const text = acInput.value.trim();
      if (text) sendInstruction(text);
    }
  });

  // --- status / polling -------------------------------------------------

  let loadedHash = null;
  function checkDrift(status) {
    const hash = status.lastCommit && status.lastCommit.hash;
    if (!hash) return;
    if (loadedHash === null) {
      loadedHash = hash;
      return;
    }
    if (hash !== loadedHash) showReload();
  }

  function renderStatus(status) {
    dot.classList.add("on");
    toggle.classList.remove("ac-offline");
    if (stateEl.className.indexOf("ok") < 0) setState("console connected · " + status.commits + " snapshot(s)");
    checkDrift(status);

    const warnings = [];
    if (status.agent && status.agent.ready === false) {
      warnings.push("agent CLI `" + (status.agent.cmd || "opencode") + "` not found");
    }
    (status.warnings || []).forEach((warning) => warnings.push(warning));

    if (status.healthy === false) {
      renderHealth("bad", "⚠ BREAKAGE: " + ((status.problems || [])[0] || "unknown"), true);
    } else if (warnings.length) {
      renderHealth("warn", "✅ healthy · " + warnings[0], false);
    } else if (status.lastCommit) {
      const action = consoleAction(status.lastCommit);
      renderHealth("ok", "✅ healthy · " + (action ? noteText(status.lastCommit) : "last snapshot") + " · " + fmtTime(status.lastCommit.time), false);
    }
  }

  function loadRuns() {
    fetch("/api/runs", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        runsOrder.length = 0;
        (body.runs || []).slice(0, 50).forEach((record) => {
          runsCache[record.id] = record;
          if (runsOrder.indexOf(record.id) < 0) runsOrder.push(record.id);
        });
        renderHistory();
      })
      .catch(() => {});
  }

  function loadCommits() {
    fetch("/api/commits", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        commitsCache.length = 0;
        (body.commits || []).slice(0, 30).forEach((entry) => commitsCache.push(entry));
        renderHistory();
      })
      .catch(() => {});
  }

  function upsertRun(record) {
    runsCache[record.id] = record;
    if (runsOrder.indexOf(record.id) < 0) runsOrder.unshift(record.id);
    renderHistory();
  }

  let sseLive = false;
  setInterval(() => {
    loadCommits();
    if (sseLive) return;
    fetch("/api/status", { cache: "no-store" })
      .then((response) => response.json())
      .then(renderStatus)
      .catch(() => {
        dot.classList.remove("on");
        toggle.classList.add("ac-offline");
        setState("console offline — run python3 tools/serve.py", "err");
        renderHealth("bad", "⚠ console offline — serve.py is not answering", false);
      });
    loadRuns();
  }, POLL_MS);

  try {
    const events = new EventSource("/api/events");
    events.addEventListener("open", () => { sseLive = true; });
    events.addEventListener("status", (event) => renderStatus(JSON.parse(event.data)));
    events.addEventListener("commit", (event) => {
      const data = JSON.parse(event.data);
      showReload();
      if (data.entry && !commitsCache.some((c) => c.id === data.entry.id)) {
        commitsCache.unshift(data.entry);
        commitsCache.length = Math.min(commitsCache.length, 30);
        renderHistory();
      }
    });
    events.addEventListener("run", (event) => upsertRun(JSON.parse(event.data)));
    events.addEventListener("instruction", () => setState("instruction queued — the agent is starting", "ok"));
    events.addEventListener("breakage", (event) => {
      const data = JSON.parse(event.data);
      renderHealth("bad", "⚠ BREAKAGE: " + ((data.problems || ["unknown"])[0]), true);
    });
    events.onerror = () => { sseLive = false; };
  } catch (err) {
    /* no EventSource: the poller alone keeps the panel useful */
  }

  loadCommits();
  loadRuns();

  window.aiConsole = { open: openPanel, close: closePanel, toggle: togglePanel };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
}
