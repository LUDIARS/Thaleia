export const UNIFIED_VIEWER_HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Thaleia Unified View</title>
  <style>
    :root{--fg:#20242c;--muted:#667085;--line:#d9dee7;--bg:#f5f7fa;--panel:#fff;--accent:#2563eb;--ok:#157347;--warn:#b54708;--bad:#b42318}
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,"Yu Gothic UI",sans-serif;color:var(--fg);background:var(--bg)}
    header{background:var(--panel);border-bottom:1px solid var(--line);padding:16px 20px}
    h1{font-size:18px;margin:0}
    main{max-width:1180px;margin:0 auto;padding:18px 20px}
    form{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:14px}
    label{font-size:12px;color:var(--muted);display:block;margin-bottom:4px}
    input{width:100%;border:1px solid var(--line);border-radius:6px;padding:9px 10px;font-size:13px;background:#fff}
    button{border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:6px;padding:9px 14px;font-size:13px;cursor:pointer}
    .summary{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin:12px 0}
    .metric{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px}
    .metric span{display:block;font-size:11px;color:var(--muted)}
    .metric b{font-size:21px}
    section{margin:18px 0}
    h2{font-size:15px;margin:0 0 8px}
    table{width:100%;border-collapse:collapse;background:var(--panel);font-size:13px}
    th,td{border:1px solid var(--line);padding:7px 9px;text-align:left;vertical-align:top}
    th{background:#eef2f7;font-weight:600}
    .pill{display:inline-block;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;white-space:nowrap}
    .covered{background:#ecfdf3;color:var(--ok)}
    .spec-only{background:#fff7ed;color:var(--warn)}
    .code-only,.anatomia-only{background:#eff6ff;color:var(--accent)}
    .muted{color:var(--muted);font-size:12px}
    .warn{color:var(--warn)}
    .error{color:var(--bad);background:#fff1f0;border:1px solid #ffccc7;border-radius:8px;padding:10px}
    .empty{color:var(--muted);background:#fff;border:1px dashed var(--line);border-radius:8px;padding:12px}
    code{background:#eef2f7;border-radius:4px;padding:1px 5px}
    @media (max-width:840px){form{grid-template-columns:1fr}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
  </style>
</head>
<body>
<header><h1>Thaleia Unified View</h1></header>
<main>
  <form id="form">
    <div><label for="an">Anatomia project</label><input id="an" required placeholder="project id"></div>
    <div><label for="pf">Praeforma project</label><input id="pf" placeholder="optional"></div>
    <div><label for="label">Label</label><input id="label" placeholder="optional"></div>
    <button>Load</button>
  </form>
  <div id="out" class="empty">Anatomia project を入力して読み込んでください。</div>
</main>
<script>
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const statusText = {covered:'covered', 'spec-only':'spec only', 'code-only':'code only', 'anatomia-only':'Anatomia only'};

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const an = $('#an').value.trim();
  const pf = $('#pf').value.trim();
  const label = $('#label').value.trim();
  const qs = new URLSearchParams({ anatomiaProject: an });
  if (pf) qs.set('pfProject', pf);
  if (label) qs.set('label', label);
  $('#out').innerHTML = '<div class="empty">loading...</div>';
  try {
    const res = await fetch('/api/unified?' + qs.toString());
    const data = await res.json();
    if (!res.ok) {
      $('#out').innerHTML = '<div class="error">' + esc(data.error) + ' ' + esc(data.hint || data.detail || '') + '</div>';
      return;
    }
    render(data);
  } catch (err) {
    $('#out').innerHTML = '<div class="error">' + esc(err) + '</div>';
  }
});

function render(data) {
  const s = data.summary;
  const warnings = (data.warnings || []).map((w) => '<span class="warn">' + esc(w) + '</span>').join(' ');
  const domainRows = (data.domains || []).map((d) => {
    const specs = (d.praeformaSpecs || []).map((x) => esc(x.code || x.title)).join(', ') || '<span class="muted">none</span>';
    const links = (d.specLinks || []).slice(0, 4).map((x) => '<code>' + esc(x.clauseHeading) + '</code>').join(' ') || '<span class="muted">none</span>';
    return '<tr><td>' + esc(d.domain) + '</td><td><span class="pill ' + esc(d.status) + '">' + esc(statusText[d.status] || d.status) + '</span></td><td>' + esc(d.implementorCount) + '</td><td>' + specs + '</td><td>' + links + '</td></tr>';
  }).join('');
  const specRows = (data.specs || []).map((sp) => {
    const domains = [...(sp.targetDomains || []), ...(sp.linkedDomains || [])].filter((v, i, a) => a.indexOf(v) === i).join(', ') || '<span class="muted">none</span>';
    const fns = (sp.linkedFunctions || []).slice(0, 5).map((f) => '<code>' + esc(f.name) + '</code>').join(' ') || '<span class="muted">none</span>';
    return '<tr><td>' + esc(sp.source) + '</td><td>' + esc(sp.code || sp.title) + '</td><td>' + esc(sp.title) + '</td><td>' + domains + '</td><td>' + fns + '</td><td>' + (sp.implemented ? '<span class="pill covered">yes</span>' : '<span class="pill spec-only">no</span>') + '</td></tr>';
  }).join('');
  $('#out').innerHTML =
    '<div class="muted">mode: <b>' + esc(data.mode) + '</b> / generated: ' + esc(data.generatedAt) + (warnings ? ' / ' + warnings : '') + '</div>' +
    '<div class="summary">' +
      metric('domains', s.domains) + metric('specs', s.specs) + metric('Pf specs', s.praeformaSpecs) + metric('An clauses', s.anatomiaSpecClauses) +
      metric('covered', s.coveredDomains) + metric('spec only', s.specOnlyDomains) + metric('code only', s.codeOnlyDomains) +
    '</div>' +
    '<section><h2>Domains</h2><table><thead><tr><th>Domain</th><th>Status</th><th>Functions</th><th>Praeforma specs</th><th>Anatomia spec clauses</th></tr></thead><tbody>' + domainRows + '</tbody></table></section>' +
    '<section><h2>Specs</h2><table><thead><tr><th>Source</th><th>Code / Clause</th><th>Title</th><th>Domains</th><th>Functions</th><th>Implemented</th></tr></thead><tbody>' + specRows + '</tbody></table></section>';
}

function metric(label, value) {
  return '<div class="metric"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
}
</script>
</body>
</html>`;
