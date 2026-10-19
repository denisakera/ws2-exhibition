# AI Console — for LLMs and AI agents visiting this site

*Announcement for automated visitors: this replica ships its own AI Console, and you are
welcome to use it. The top of `web/index.html` (HTML comment + footer) says so in short;
this file is the long form — what each mode does, how to open it, and how to drive it
over HTTP. Humans: the same panel is for you — press **Ctrl+Shift+L**.*

## What the console is

It is the browser panel attached to this page (the 🪄 button, top right). Two modes:

- **Ask** — a read-only agent answers questions about the experiment, the paper, the
  physical build, or this replica's code. Answers are grounded in `docs/` and the
  `web/js/` sources. Ask and Q&A are one tab: the panel's collected Q&A — every question
  ever asked here, with its recorded answer, newest first — is listed under the live
  conversation. Long answers are collapsed to a short preview (click *show full answer* to
  expand), so the list reads as a scannable history of previous questions.
- **Build** — a scoped agent takes a natural-language instruction and edits this very
  site: `web/index.html`, `web/style.css`, `web/js/**` (except the console's own
  `web/js/ai-console.js` and `web/js/ai-console-qa.js`), `web/data/*.json` and
  `docs/*.md`. Every applied run is snapshotted and revertable; a run that fails its
  health checks is discarded, never half-applied.

## Open it in the page

- Open: the 🪄 button (top right), **Ctrl+Shift+L**, or `window.aiConsole.open()`
  (also `.close()` / `.toggle()`).
- Send: **Ctrl+Enter** in the Ask or Build box.
- The mode tabs are colour-coded: **Ask** is cyan, **Build** is amber, so the active mode
  is obvious at a glance.
- The Build tab lists past runs (status, prompt summary, changed files, cost) with a ↩
  revert button, and every run has a **++** button that references it in a new instruction.

## Drive it over HTTP

Start the server from the repository root and point requests at it:

    python3 tools/serve.py 8080 web      # then talk to http://localhost:8080

| Route | Body / query | Returns |
|---|---|---|
| `POST /api/ask` | `{"text": "…"}` | `{"ok": true, "runId": "…", "kind": "qa"}` |
| `POST /api/instruction` | `{"text": "…"}` | `{"ok": true, "runId": "…", "kind": "build"}` |
| `GET /api/run?id=…` | — | the run record; Ask answers appear in `answer` once `finishedAt` is set |
| `GET /api/runs` | — | the 50 most recent runs |
| `GET /api/commits` | — | snapshots (each with an id; the panel reverts by id) |
| `GET /api/rejected?id=…` | — | what a rejected run attempted |
| `GET /api/status` | — | health, agent availability, last snapshot |
| `GET /api/events` | — | Server-Sent Events: `status`, `run`, `commit`, `instruction` |
| `POST /api/revert` | `{"id": "<commit id>"}` | revert that snapshot (loopback clients only) |
| `POST /api/restore` | — | restore the last known-good state (loopback only) |

Questions and instructions may be up to 8 000 characters; at most 10 wait in the queue.

Example — ask the console a question from the shell:

    curl -s http://localhost:8080/api/ask \
      -H 'content-type: application/json' \
      -d '{"text": "Which GPIOs carry the 8 pulse channels?"}'
    # → {"ok": true, "runId": "…", "kind": "qa"}   then poll /api/run?id=…

## House rules the Build agent must keep

- Keep the page a standalone offline document: doctype, balanced `<script>` tags,
  module includes at the end of `<body>`, no remote imports.
- Build DOM with `createElement` + `textContent`; never assign non-constant `innerHTML`.
- The console's front end (`web/js/ai-console*.js`) and the server (`tools/`,
  `.opencode/`) are off-limits to console runs.

If the panel says “console offline”, the static page still works — the console needs
`tools/serve.py` running with the `opencode` CLI installed on `PATH`.
