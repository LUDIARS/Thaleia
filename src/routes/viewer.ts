// 突合専用ビューア (ビルド不要の素朴な SPA)。
//
// Thaleia の UI は「突合差分」を中身にし、 編集/解析は持たない。 ギャップを見つけたら
//   - 実装欠落 (spec-only) → Praeforma で仕様を開く
//   - 仕様欠落 (code-only) → Anatomia で実装を見る
// へディープリンクで送り出す (= ハブ性はナビゲーションとして持つ)。
//
// データ源:
//   GET /api/config            設定有無 (リンク先/突合可否)
//   GET /api/snapshots         保存済み突合の一覧 (カード)
//   GET /api/snapshots/:label  1 件 (行ごとのディープリンク付き)
//   POST /reconcile            新規突合

export const VIEWER_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thaleia — 企画↔実装 突合</title>
<style>
 :root{--fg:#1d2230;--muted:#6b7280;--line:#e3e5ea;--bg:#f6f7f9;--brand:#2a6df4;
  --matched:#1f8a4c;--mismatch:#b8860b;--specOnly:#c0392b;--codeOnly:#8e44ad}
 *{box-sizing:border-box}
 body{font-family:system-ui,"Yu Gothic UI",sans-serif;margin:0;color:var(--fg);background:#fbfcfe;line-height:1.5}
 header{padding:18px 20px;border-bottom:1px solid var(--line);background:#fff}
 h1{font-size:18px;margin:0}
 .sub{color:var(--muted);font-size:12px;margin-top:4px}
 main{max-width:1080px;margin:0 auto;padding:18px 20px}
 .notice{font-size:12px;color:var(--muted);background:var(--bg);border:1px solid var(--line);
  border-radius:10px;padding:8px 12px;margin:0 0 14px}
 .notice.warn{color:#92400e;background:#fff7ed;border-color:#fed7aa}
 section{margin:18px 0}
 h2{font-size:14px;margin:0 0 10px;color:var(--fg)}
 .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
 /* Foundation 風入力: 角丸 + やや大きめ padding */
 input{padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:13px;min-width:180px}
 button{padding:10px 16px;border:1px solid var(--brand);background:var(--brand);color:#fff;
  border-radius:10px;cursor:pointer;font-size:13px}
 button.ghost{background:#fff;color:var(--brand)}
 .cards{display:flex;gap:10px;flex-wrap:wrap}
 .snap{border:1px solid var(--line);border-radius:12px;padding:12px 14px;min-width:200px;cursor:pointer;background:#fff}
 .snap:hover{border-color:var(--brand)}
 .snap b{font-size:14px;display:block}
 .snap .meta{color:var(--muted);font-size:11px;margin-top:4px}
 .pill{display:inline-block;font-size:11px;padding:1px 7px;border-radius:999px;margin-right:4px}
 .pill.gap{background:#fef2f2;color:var(--specOnly)}
 .pill.ok{background:#ecfdf5;color:var(--matched)}
 .pill.sem{background:#eef2ff;color:#4338ca}
 .stat{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 12px}
 .stat .c{border:1px solid var(--line);border-radius:10px;padding:8px 12px;min-width:96px;background:#fff}
 .stat .c span{color:var(--muted);font-size:11px}
 .stat .c b{font-size:20px;display:block}
 table{border-collapse:collapse;width:100%;font-size:13px;background:#fff}
 th,td{border:1px solid var(--line);padding:7px 9px;text-align:left;vertical-align:top}
 th{background:var(--bg);font-weight:600}
 .badge{font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap}
 .matched{color:var(--matched);background:#ecfdf5}
 .name-mismatch{color:var(--mismatch);background:#fffbeb}
 .spec-only{color:var(--specOnly);background:#fef2f2}
 .code-only{color:var(--codeOnly);background:#f5f3ff}
 .legend{font-size:11px;color:var(--muted);margin:4px 0 8px}
 .legend .badge{margin-right:6px}
 .yes{color:var(--matched);font-weight:600}.no{color:var(--specOnly);font-weight:600}
 .lnk{display:inline-block;font-size:11px;padding:3px 9px;border:1px solid var(--brand);color:var(--brand);
  border-radius:8px;text-decoration:none;margin:1px 4px 1px 0;white-space:nowrap}
 .lnk:hover{background:var(--brand);color:#fff}
 .lnk-off{display:inline-block;font-size:11px;padding:3px 9px;border:1px dashed var(--line);color:var(--muted);
  border-radius:8px;margin:1px 4px 1px 0;white-space:nowrap}
 .gaps{display:flex;gap:14px;flex-wrap:wrap}
 .gapbox{flex:1;min-width:280px;border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:#fff}
 .gapbox h3{font-size:13px;margin:0 0 8px}
 .gapbox ul{margin:0;padding-left:0;list-style:none}
 .gapbox li{padding:5px 0;border-bottom:1px dashed var(--line);font-size:13px}
 .gapbox li:last-child{border-bottom:none}
 .empty{color:var(--muted);font-size:12px}
 .diffbox{border:1px solid var(--line);border-left:4px solid var(--brand);border-radius:10px;
  padding:10px 14px;margin:12px 0;background:#fafbff;font-size:13px}
 .diffbox h3{font-size:13px}
 .diffbox b.yes{color:#0a7d33}.diffbox b.no{color:#c0392b}
 .tracebox{border:1px solid var(--line);border-left:4px solid #0a7d33;border-radius:10px;
  padding:10px 14px;margin:10px 0;background:#f6fbf7}
 .tracebox code{font-size:12px;background:#eef;padding:1px 5px;border-radius:5px}
 .muted{color:var(--muted);font-size:12px}
 #form{display:none;margin-top:10px}
 #form.open{display:block}
</style></head><body>
<header>
 <h1>Thaleia — 企画↔実装 トレーサビリティ</h1>
 <div class="sub">Praeforma(人間の仕様) と Anatomia(コード解析) を突合し、 ギャップを各サービスへ送り出します。</div>
</header>
<main>
 <div id="notice"></div>

 <section>
  <div class="row" style="justify-content:space-between">
   <h2 style="margin:0">突合スナップショット</h2>
   <button class="ghost" id="toggleForm">＋ 新規突合</button>
  </div>
  <form id="form">
   <div class="row">
    <input id="label" placeholder="表示名 (例: PrivateGame)" required>
    <input id="pf" placeholder="Praeforma project id" required>
    <input id="an" placeholder="Anatomia project id (省略可)">
    <button id="runBtn">突合する</button>
   </div>
   <div class="muted" id="formMsg" style="margin-top:6px"></div>
  </form>
  <div id="list" class="cards" style="margin-top:12px"></div>
 </section>

 <section id="detail" style="display:none"></section>
</main>
<script>
const $=s=>document.querySelector(s);
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
const STATUS_JA={matched:'一致','name-mismatch':'表記ゆれ','spec-only':'実装欠落','code-only':'仕様欠落'};
let CFG={praeformaWeb:false,anatomiaWeb:false,reconcileReady:false};

function lnk(url,label){
 if(url)return '<a class="lnk" href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(label)+'</a>';
 return '<span class="lnk-off" title="リンク先 web URL が未設定">'+esc(label)+'</span>';
}

async function loadConfig(){
 try{CFG=await (await fetch('/api/config')).json()}catch{/* デフォルトのまま */}
 const n=[];
 if(!CFG.reconcileReady)n.push('<div class="notice warn">上流未設定: PRAEFORMA_BASE_URL / ANATOMIA_BASE_URL を設定すると突合できます。</div>');
 if(!CFG.praeformaWeb||!CFG.anatomiaWeb){
  const miss=[!CFG.praeformaWeb&&'PRAEFORMA_WEB_URL',!CFG.anatomiaWeb&&'ANATOMIA_WEB_URL'].filter(Boolean).join(' / ');
  n.push('<div class="notice">'+esc(miss)+' 未設定のため、 該当サービスへのディープリンクは無効表示になります。</div>');
 }
 $('#notice').innerHTML=n.join('');
}

async function loadList(){
 const j=await (await fetch('/api/snapshots')).json();
 const items=j.items||[];
 if(!items.length){$('#list').innerHTML='<div class="empty">まだ突合がありません。「＋ 新規突合」から実行してください。</div>';return}
 $('#list').innerHTML=items.map(s=>{
  const su=s.summary||{};
  const gap=s.gapCount||0;
  return '<div class="snap" data-label="'+esc(s.project)+'">'+
   '<b>'+esc(s.project)+'</b>'+
   '<div style="margin-top:6px">'+
    (gap>0?'<span class="pill gap">ギャップ '+gap+'</span>':'<span class="pill ok">ギャップなし</span>')+
    '<span class="pill ok">一致 '+esc(su.matchedDomains)+'/'+esc(su.pfDomains)+'</span>'+
   '</div>'+
   '<div class="meta">仕様 '+esc(su.implementedSpecs)+'/'+esc(su.specs)+' 実装済 ・ '+esc((s.generatedAt||'').replace('T',' ').slice(0,16))+'</div>'+
  '</div>';
 }).join('');
 document.querySelectorAll('.snap').forEach(el=>el.onclick=()=>openDetail(el.dataset.label));
}

async function openDetail(label){
 const res=await fetch('/api/snapshots/'+encodeURIComponent(label));
 if(!res.ok){$('#detail').style.display='block';$('#detail').innerHTML='<p class="no">読み込み失敗: '+esc(label)+'</p>';return}
 render(await res.json());
}

function render(r){
 const su=r.summary;
 // ドメイン突合行 (アクション = 存在する側へのディープリンク)。
 window.__anProject=r.anatomiaProject||'';
 window.__pfProject=r.pfProjectId||'';
 const dm=r.domainMatches.map(m=>{
  const acts=[];
  if(m.pfDomain)acts.push(lnk(m.links&&m.links.praeforma,'仕様を編集 ✎'));
  if(m.anatomiaDomain)acts.push(lnk(m.links&&m.links.anatomia,'実装を見る ↗'));
  // 実装ありドメインは関数粒度トレースへ掘り下げ可能。
  if(m.anatomiaDomain)acts.push('<button class="lnk traceBtn" data-an="'+esc(m.anatomiaDomain)+'">関数 ▾</button>');
  return '<tr><td>'+esc(m.pfDomain??'—')+'</td><td>'+esc(m.anatomiaDomain??'—')+'</td>'+
   '<td><span class="badge '+m.status+'">'+esc(STATUS_JA[m.status]||m.status)+'</span>'+(m.semantic?' <span class="pill sem">意味照合</span>':'')+'</td>'+
   '<td>'+acts.join('')+'</td></tr>';
 }).join('');
 // シーン(layout)突合行 (domain と同形。 旧スナップショットは sceneMatches 無し)。
 const sm=(r.sceneMatches||[]).map(m=>{
  const acts=[];
  if(m.pfScene)acts.push(lnk(m.links&&m.links.praeforma,'仕様を編集 ✎'));
  if(m.anatomiaScreen)acts.push(lnk(m.links&&m.links.anatomia,'実装を見る ↗'));
  return '<tr><td>'+esc(m.pfScene??'—')+'</td><td>'+esc(m.anatomiaScreen??'—')+'</td>'+
   '<td><span class="badge '+m.status+'">'+esc(STATUS_JA[m.status]||m.status)+'</span>'+(m.semantic?' <span class="pill sem">意味照合</span>':'')+'</td>'+
   '<td>'+acts.join('')+'</td></tr>';
 }).join('');
 const hasScenes=(su.pfScenes||0)>0||(su.anatomiaScreens||0)>0;
 // 仕様カバレッジ (target は domain + scene)。
 const sc=r.specCoverage.map(s=>{
  const tgt=[...(s.targetDomains||[]),...((s.targetScenes||[]).map(x=>'scene:'+x))].join(', ')||'—';
  // target ドメインを持つ仕様は spec 起点で実装関数へ直接掘り下げできる。
  const acts=[lnk(s.praeformaUrl,'仕様を開く ✎')];
  if((s.targetDomains||[]).length)acts.push('<button class="lnk specTraceBtn" data-spec="'+esc(s.specCode)+'">関数 ▾</button>');
  return '<tr><td>'+esc(s.specCode)+'</td><td>'+esc(s.specTitle)+'</td><td>'+esc(tgt)+'</td>'+
  '<td class="'+(s.implemented?'yes':'no')+'">'+(s.implemented?'実装あり':'未実装')+'</td>'+
  '<td class="muted">'+esc(s.evidence)+'</td>'+
  '<td>'+acts.join('')+'</td></tr>';
 }).join('');
 // ギャップ・ワークリスト (リンクは詳細行から引く)。
 const specUrl={};r.specCoverage.forEach(s=>{specUrl[s.specCode]=s.praeformaUrl});
 const codeUrl={};r.domainMatches.forEach(m=>{if(m.status==='code-only')codeUrl[m.anatomiaDomain]=m.links&&m.links.anatomia});
 const screenUrl={};(r.sceneMatches||[]).forEach(m=>{if(m.status==='code-only')screenUrl[m.anatomiaScreen]=m.links&&m.links.anatomia});
 const g1=(r.gaps.specsWithoutImpl||[]).map(c=>'<li>'+esc(c)+' '+lnk(specUrl[c],'仕様へ ✎')+'</li>').join('')||'<li class="empty">なし</li>';
 const g2=(r.gaps.codeDomainsWithoutSpec||[]).map(n=>'<li>'+esc(n)+' '+lnk(codeUrl[n],'実装へ ↗')+'</li>').join('')||'<li class="empty">なし</li>';
 const g3=(r.gaps.codeScreensWithoutSpec||[]).map(n=>'<li>'+esc(n)+' '+lnk(screenUrl[n],'実装へ ↗')+'</li>').join('')||'<li class="empty">なし</li>';
 // 前回比 (history に直前 run があるときだけ)。 進捗が一目で分かる行を出す。
 const diffHtml=renderDiff(r.diff);

 $('#detail').style.display='block';
 $('#detail').innerHTML=
  '<h2>'+esc(r.project)+' <span class="muted" style="font-weight:400">('+esc((r.generatedAt||'').replace('T',' ').slice(0,16))+')</span></h2>'+
  '<div class="stat">'+
   c('Pfドメイン',su.pfDomains)+c('実装ドメイン',su.anatomiaDomains)+c('一致',su.matchedDomains)+
   (hasScenes?c('Pfシーン',su.pfScenes)+c('実装スクリーン',su.anatomiaScreens)+c('シーン一致',su.matchedScenes):'')+
   c('仕様',su.specs)+c('実装済仕様',su.implementedSpecs)+'</div>'+
  '<div class="legend">'+
   '<span class="badge matched">一致</span>表記そのまま '+
   '<span class="badge name-mismatch">表記ゆれ</span>正規化で一致 '+
   '<span class="badge spec-only">実装欠落</span>仕様のみ '+
   '<span class="badge code-only">仕様欠落</span>実装のみ</div>'+
  diffHtml+
  '<table><tr><th>Praeforma(仕様)</th><th>Anatomia(実装)</th><th>状態</th><th>アクション</th></tr>'+dm+'</table>'+
  '<div id="traceOut"></div>'+
  (hasScenes?
   '<h2 style="margin-top:18px">シーン(layout)突合</h2>'+
   '<table><tr><th>Praeforma(シーン)</th><th>Anatomia(スクリーン)</th><th>状態</th><th>アクション</th></tr>'+sm+'</table>'
   :'')+
  '<h2 style="margin-top:18px">仕様カバレッジ</h2>'+
  '<table><tr><th>code</th><th>title</th><th>target</th><th>実装</th><th>根拠</th><th>アクション</th></tr>'+sc+'</table>'+
  '<div id="specTraceOut"></div>'+
  '<h2 style="margin-top:18px">ギャップ・ワークリスト</h2>'+
  '<div class="gaps">'+
   '<div class="gapbox"><h3 class="no">未実装の仕様 (Praeforma へ)</h3><ul>'+g1+'</ul></div>'+
   '<div class="gapbox"><h3 class="code-only">仕様の無い実装ドメイン (Anatomia へ)</h3><ul>'+g2+'</ul></div>'+
   (hasScenes?'<div class="gapbox"><h3 class="code-only">仕様の無い実装スクリーン (Anatomia へ)</h3><ul>'+g3+'</ul></div>':'')+
  '</div>'+
  '<h2 style="margin-top:18px">未批准 spec-link ワークリスト</h2>'+
  '<div class="muted" style="margin-bottom:6px">Anatomia の spec-link のうち <b>未批准 (ratified:false)</b> ・ <b>低 confidence</b> のものを集めて、 要レビューのコード↔仕様リンクを棚卸しします。</div>'+
  '<button class="lnk" id="worklistBtn">ワークリストを読み込む</button>'+
  '<div id="worklistOut"></div>';
 // 関数トレースのドリルダウン (実装ありドメインの「関数 ▾」)。
 $('#detail').querySelectorAll('.traceBtn').forEach(b=>b.onclick=()=>openTrace(b.dataset.an));
 // spec 起点の関数トレース (仕様カバレッジ行の「関数 ▾」)。
 $('#detail').querySelectorAll('.specTraceBtn').forEach(b=>b.onclick=()=>openSpecTrace(b.dataset.spec));
 // 未批准 spec-link ワークリスト。
 const wb=$('#worklistBtn');if(wb)wb.onclick=()=>openWorklist();
 $('#detail').scrollIntoView({behavior:'smooth',block:'start'});
}
async function openTrace(domain){
 const out=$('#traceOut');if(!out)return;
 out.innerHTML='<div class="muted" style="padding:8px">「'+esc(domain)+'」の実装関数を取得中…</div>';
 try{
  const res=await fetch('/api/trace?project='+encodeURIComponent(window.__anProject||'')+'&domain='+encodeURIComponent(domain));
  const r=await res.json();
  if(!res.ok){out.innerHTML='<div class="no" style="padding:8px">トレース失敗: '+esc(r.error||'')+' '+esc(r.hint||r.detail||'')+'</div>';return}
  if(!r.matched){out.innerHTML='<div class="muted" style="padding:8px">「'+esc(domain)+'」は Anatomia の検出ドメインに無し。</div>';return}
  const su=r.summary||{};
  const rows=(r.functions||[]).map(f=>{
   const links=(f.specLinks||[]).map(l=>'<span class="pill '+(l.ratified?'ok':'gap')+'" title="'+esc(l.clauseFile)+' ('+esc(l.confidence)+')">'+esc(l.clauseHeading)+'</span>').join(' ')||'<span class="muted">spec リンクなし</span>';
   return '<tr><td><code>'+esc(f.name)+'</code></td><td class="muted">'+esc(f.path)+'</td><td>'+links+'</td></tr>';
  }).join('');
  out.innerHTML='<div class="tracebox"><h3 style="margin:0 0 6px">関数トレース: '+esc(domain)+
   ' <span class="muted" style="font-weight:400">('+esc(su.functionCount)+' 関数 / spec リンクあり '+esc(su.linkedFunctions)+
   (su.truncated?' / 上限切り詰め 全'+esc(su.totalImplementors):'')+')</span></h3>'+
   '<table><tr><th>関数</th><th>ファイル</th><th>spec 節リンク</th></tr>'+rows+'</table>'+
   '<div style="margin-top:6px"><button class="lnk" id="traceClose">閉じる</button></div></div>';
  $('#traceClose').onclick=()=>{out.innerHTML=''};
 }catch(e){out.innerHTML='<div class="no" style="padding:8px">'+esc(e)+'</div>'}
}
// spec 起点の関数トレース: 仕様 → target ドメイン群 → 実装関数 + spec-links。
async function openSpecTrace(spec){
 const out=$('#specTraceOut');if(!out)return;
 out.innerHTML='<div class="muted" style="padding:8px">仕様「'+esc(spec)+'」の実装関数を取得中…</div>';
 try{
  const res=await fetch('/api/trace/spec?pfProject='+encodeURIComponent(window.__pfProject||'')+'&anatomiaProject='+encodeURIComponent(window.__anProject||'')+'&spec='+encodeURIComponent(spec));
  const r=await res.json();
  if(!res.ok){out.innerHTML='<div class="no" style="padding:8px">トレース失敗: '+esc(r.error||'')+' '+esc(r.hint||r.detail||'')+'</div>';return}
  const su=r.summary||{};
  const blocks=(r.domains||[]).map(d=>{
   if(!d.matched)return '<div class="muted" style="margin:6px 0">ドメイン「'+esc(d.domain)+'」は Anatomia の検出ドメインに無し。</div>';
   const rows=(d.functions||[]).map(f=>{
    const links=(f.specLinks||[]).map(l=>'<span class="pill '+(l.ratified?'ok':'gap')+'" title="'+esc(l.clauseFile)+' ('+esc(l.confidence)+')">'+esc(l.clauseHeading)+'</span>').join(' ')||'<span class="muted">spec リンクなし</span>';
    return '<tr><td><code>'+esc(f.name)+'</code></td><td class="muted">'+esc(f.path)+'</td><td>'+links+'</td></tr>';
   }).join('');
   const ds=d.summary||{};
   return '<div style="margin:8px 0"><b>ドメイン: '+esc(d.domain)+'</b> <span class="muted">('+esc(ds.functionCount)+' 関数 / spec リンクあり '+esc(ds.linkedFunctions)+(ds.truncated?' / 上限切り詰め 全'+esc(ds.totalImplementors):'')+')</span>'+
    '<table><tr><th>関数</th><th>ファイル</th><th>spec 節リンク</th></tr>'+rows+'</table></div>';
  }).join('')||'<div class="muted" style="padding:6px">この仕様に target ドメインがありません。</div>';
  out.innerHTML='<div class="tracebox"><h3 style="margin:0 0 6px">仕様トレース: '+esc(r.specCode)+' '+esc(r.specTitle)+
   ' <span class="muted" style="font-weight:400">(target '+esc(su.matchedDomains)+'/'+esc(su.domainCount)+' 実装 ・ '+esc(su.functionCount)+' 関数 / spec リンクあり '+esc(su.linkedFunctions)+')</span></h3>'+
   blocks+
   '<div style="margin-top:6px"><button class="lnk" id="specTraceClose">閉じる</button></div></div>';
  $('#specTraceClose').onclick=()=>{out.innerHTML=''};
 }catch(e){out.innerHTML='<div class="no" style="padding:8px">'+esc(e)+'</div>'}
}
// 未批准 spec-link ワークリスト: ratified:false / 低 confidence のリンクを要レビューで並べる。
async function openWorklist(){
 const out=$('#worklistOut');if(!out)return;
 out.innerHTML='<div class="muted" style="padding:8px">ワークリストを取得中…</div>';
 try{
  const res=await fetch('/api/links/worklist?project='+encodeURIComponent(window.__anProject||''));
  const r=await res.json();
  if(!res.ok){out.innerHTML='<div class="no" style="padding:8px">取得失敗: '+esc(r.error||'')+' '+esc(r.hint||r.detail||'')+'</div>';return}
  const su=r.summary||{};
  if(!(r.items||[]).length){out.innerHTML='<div class="tracebox"><div class="muted" style="padding:4px">要レビューの spec-link はありません (全 '+esc(su.totalLinks)+' 件、 閾値 '+esc(r.threshold)+')。</div></div>';return}
  const rows=(r.items||[]).map(it=>{
   const name=it.resolvedName||it.fromName||it.from;
   const reasons=(it.reasons||[]).map(x=>x==='unratified'?'<span class="pill gap">未批准</span>':'<span class="pill sem">低conf</span>').join(' ');
   return '<tr><td><code>'+esc(name)+'</code><div class="muted">'+esc(it.resolvedPath||it.from)+'</div></td>'+
    '<td>'+esc(it.clauseHeading)+'<div class="muted">'+esc(it.clauseFile)+'</div></td>'+
    '<td>'+esc(it.confidence)+'</td><td>'+reasons+'</td></tr>';
  }).join('');
  out.innerHTML='<div class="tracebox" style="border-left-color:#b8860b;background:#fffdf5"><h3 style="margin:0 0 6px">要レビュー spec-link '+
   '<span class="muted" style="font-weight:400">(要レビュー '+esc(su.flagged)+' / 全 '+esc(su.totalLinks)+' ・ 未批准 '+esc(su.unratified)+' ・ 低conf '+esc(su.lowConfidence)+' ・ 閾値 '+esc(r.threshold)+(su.truncated?' ・ 上限切り詰め 表示 '+esc(su.shown):'')+')</span></h3>'+
   '<table><tr><th>コード (関数/ファイル)</th><th>spec 節</th><th>conf</th><th>理由</th></tr>'+rows+'</table>'+
   '<div style="margin-top:6px"><button class="lnk" id="worklistClose">閉じる</button></div></div>';
  $('#worklistClose').onclick=()=>{out.innerHTML=''};
 }catch(e){out.innerHTML='<div class="no" style="padding:8px">'+esc(e)+'</div>'}
}
function c(t,v){return '<div class="c"><span>'+esc(t)+'</span><b>'+esc(v)+'</b></div>'}
// 前回比のレンダ。 hasPrevious=false (初回) は何も出さない。
function renderDiff(d){
 if(!d||!d.hasPrevious)return '';
 const chips=Object.keys(d.summaryDelta||{}).map(k=>{const v=d.summaryDelta[k];return '<span class="pill '+(v>0?'ok':'no')+'">'+esc(k)+' '+(v>0?'+':'')+esc(v)+'</span>'}).join('')||'<span class="muted">数値変化なし</span>';
 const list=(label,arr,cls)=>arr&&arr.length?'<div><b class="'+(cls||'')+'">'+esc(label)+'</b> '+arr.map(esc).join(', ')+'</div>':'';
 const chg=(label,arr)=>arr&&arr.length?'<div><b>'+esc(label)+'</b> '+arr.map(x=>esc(x.name)+'('+esc(x.from)+'→'+esc(x.to)+')').join(', ')+'</div>':'';
 const body=
  list('✅ 実装された仕様',d.specs&&d.specs.nowImplemented,'yes')+
  list('⚠ 退行した仕様',d.specs&&d.specs.regressed,'no')+
  list('＋追加された仕様',d.specs&&d.specs.added)+
  list('－消えた仕様',d.specs&&d.specs.removed)+
  chg('ドメイン状態変化',d.domains&&d.domains.statusChanged)+
  list('＋ドメイン',d.domains&&d.domains.added)+list('－ドメイン',d.domains&&d.domains.removed)+
  chg('シーン状態変化',d.scenes&&d.scenes.statusChanged)+
  list('＋シーン',d.scenes&&d.scenes.added)+list('－シーン',d.scenes&&d.scenes.removed);
 return '<div class="diffbox"><h3 style="margin:0 0 6px">前回比 <span class="muted" style="font-weight:400">('+esc((d.previousAt||'').replace('T',' ').slice(0,16))+' から)</span></h3>'+
  '<div style="margin-bottom:6px">'+chips+'</div>'+(body||'<span class="muted">突合の出入り・状態変化なし</span>')+'</div>';
}

$('#toggleForm').onclick=()=>$('#form').classList.toggle('open');
$('#form').onsubmit=async e=>{
 e.preventDefault();
 const msg=$('#formMsg');msg.textContent='突合中…';
 try{
  const res=await fetch('/reconcile',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({label:$('#label').value,pf_project:$('#pf').value,anatomia_project:$('#an').value||undefined})});
  const j=await res.json();
  if(!res.ok){msg.innerHTML='<span class="no">エラー: '+esc(j.error)+' '+esc(j.hint||j.detail||'')+'</span>';return}
  msg.textContent='完了';
  await loadList();
  // POST 応答はリンク未付与なので、 enrich 済みの詳細を引き直す。
  await openDetail(j.project);
 }catch(err){msg.innerHTML='<span class="no">'+esc(err)+'</span>'}
};

(async()=>{await loadConfig();await loadList()})();
</script></body></html>`;
