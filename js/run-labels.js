// Runs-list companion for the AI Console (web/index.html).
//
// The console front end (js/ai-console.js) is a protected control-plane file, so this
// companion module repairs its Runs list from the outside: the server records every
// question/instruction under `text` (tools/ai_console.py), while the front end renders
// each row from `record.instruction` — a field no run record carries — so every run
// description falls back to the literal placeholder "(question)". This module watches
// #runList and replaces that placeholder with the real prompt: a one-line summary in
// the row, the full text on hover.
//
// All dynamic text is untrusted and inserted with textContent, never innerHTML.

const REFRESH_DELAY_MS = 120; // debounce for fetches triggered by list re-renders
const SUMMARY_MAX = 300;      // longest description shown (the CSS ellipsis trims further)

let recordsById = {};
const described = new WeakSet();

/** The run id behind a rendered row — the ++ button's tooltip carries it. */
function runIdOf(li) {
  const ref = li.querySelector("button.ac-ref");
  if (!ref) return null;
  const match = /continue of\s+([^\s\u201d]+)/.exec(ref.title || "");
  return match ? match[1] : null;
}

/** One-line prompt from a run record; "" when the record has none. */
function promptOf(record) {
  if (!record || typeof record.text !== "string") return "";
  return record.text.replace(/\s+/g, " ").trim();
}

function summarize(text) {
  return text.length > SUMMARY_MAX ? text.slice(0, SUMMARY_MAX).trimEnd() + "…" : text;
}

function isPlaceholder(span) {
  return span.textContent === "(question)" || span.textContent === "";
}

function patchRow(li) {
  const span = li.querySelector(".row .txt");
  if (!span || described.has(span) || !isPlaceholder(span)) return;
  const id = runIdOf(li);
  const text = id ? promptOf(recordsById[id]) : "";
  if (!text) return;
  described.add(span);
  span.textContent = summarize(text);
  span.title = text;
}

function patchAll(list) {
  list.querySelectorAll("li").forEach(patchRow);
}

/** True while a visible "(question)" row refers to a run that is not cached yet. */
function missingFromCache(list) {
  const rows = list.querySelectorAll("li");
  for (const li of rows) {
    const span = li.querySelector(".row .txt");
    if (!span || described.has(span) || !isPlaceholder(span)) continue;
    const id = runIdOf(li);
    if (id && !recordsById[id]) return true;
  }
  return false;
}

function refresh(list) {
  fetch("/api/runs", { cache: "no-store" })
    .then((response) => response.json())
    .then((body) => {
      const runs = body && Array.isArray(body.runs) ? body.runs : [];
      const next = {};
      runs.forEach((record) => {
        if (record && record.id) next[record.id] = record;
      });
      recordsById = next;
      patchAll(list);
    })
    .catch(() => { /* console offline — leave the front end's fallback in place */ });
}

function attach(list) {
  let timer = null;

  function schedule() {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      if (missingFromCache(list)) refresh(list);
      else patchAll(list);
    }, REFRESH_DELAY_MS);
  }

  const onChange = () => {
    patchAll(list);
    if (missingFromCache(list)) schedule();
  };

  if (typeof MutationObserver === "function") {
    new MutationObserver(onChange).observe(list, { childList: true, subtree: true });
  } else {
    setInterval(onChange, 2000); // very old browsers: keep the descriptions fresh
  }
  refresh(list);
}

function whenRunList(callback) {
  const found = document.getElementById("runList");
  if (found) {
    callback(found);
    return;
  }
  if (typeof MutationObserver === "function" && document.body) {
    const observer = new MutationObserver(() => {
      const list = document.getElementById("runList");
      if (list) {
        observer.disconnect();
        callback(list);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return;
  }
  const timer = setInterval(() => {
    const list = document.getElementById("runList");
    if (list) {
      clearInterval(timer);
      callback(list);
    }
  }, 1000);
}

let attached = false;

export function initRunLabels() {
  if (attached) return;
  if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
  attached = true;
  whenRunList(attach);
}

initRunLabels();
