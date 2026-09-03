// 評価ビューア (ビルド不要の素朴な SPA)。 設計 §5 の 5 点を 1 ページに収める。
//
//   1. 施策一覧 (verdict と total の推移)
//   2. 施策詳細: レーダー (5 軸) + 総合 + verdict + 減点理由
//   3. Di 四象限: 2x2 散布 (点 = ペルソナ、 サイズ = 内部スコア、 色 = pass/fail)。 点クリックで内訳
//   4. improvement: デグレード危険度の内訳と「先に返済」リスト
//   5. 各 evidence から Anatomia / Discutere / Genius へディープリンク
//
// データ源: GET /api/config, GET /api/initiatives, GET /api/initiatives/:id,
//           POST /api/initiatives, POST /api/initiatives/:id/evaluate
//
// 埋め込む JS ではテンプレートリテラルを使わない (この文字列自身がテンプレートリテラルのため)。

export const EVALUATION_VIEWER_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thaleia — 施策設計 (成否リスクのスコア化)</title>
<style>
 :root{--fg:#1d2230;--muted:#6b7280;--line:#e3e5ea;--bg:#f6f7f9;--brand:#2a6df4;
  --go:#1f8a4c;--conditional:#b8860b;--defer:#8e44ad;--nogo:#c0392b;--pass:#1f8a4c;--fail:#c0392b}
 *{box-sizing:border-box}
 body{font-family:system-ui,"Yu Gothic UI",sans-serif;margin:0;color:var(--fg);background:#fbfcfe;line-height:1.5}
 header{padding:18px 20px;border-bottom:1px solid var(--line);background:#fff}
 h1{font-size:18px;margin:0}
 .sub{color:var(--muted);font-size:12px;margin-top:4px}
 main{max-width:1120px;margin:0 auto;padding:18px 20px}
 section{margin:18px 0}
 h2{font-size:14px;margin:0 0 10px}
 h3{font-size:13px;margin:16px 0 8px;color:var(--muted)}
 .notice{font-size:12px;color:var(--muted);background:var(--bg);border:1px solid var(--line);
  border-radius:10px;padding:8px 12px;margin:0 0 14px}
 .notice.warn{color:#92400e;background:#fff7ed;border-color:#fed7aa}
 .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
 /* Foundation 風入力: 角丸 + やや大きめ padding */
 input,select,textarea{padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:13px;
  font-family:inherit;background:#fff;color:inherit}
 input,select{min-width:180px}
 textarea{width:100%;min-height:120px;resize:vertical}
 button{padding:10px 16px;border:1px solid var(--brand);background:var(--brand);color:#fff;
  border-radius:10px;cursor:pointer;font-size:13px}
 button.ghost{background:#fff;color:var(--brand)}
 .cards{display:flex;gap:10px;flex-wrap:wrap}
 .card{border:1px solid var(--line);border-radius:12px;padding:12px 14px;min-width:230px;background:#fff;cursor:pointer}
 .card:hover{border-color:var(--brand)}
 .card b{font-size:14px;display:block}
 .card .meta{color:var(--muted);font-size:12px;margin-top:4px}
 .verdict{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;color:#fff}
 .verdict.go{background:var(--go)}
 .verdict.conditional{background:var(--conditional)}
 .verdict.defer{background:var(--defer)}
 .verdict.no-go{background:var(--nogo)}
 .panel{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:#fff}
 .grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
 @media (max-width:860px){.grid2{grid-template-columns:minmax(0,1fr)}}
 table{border-collapse:collapse;width:100%;font-size:13px}
 th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
 th{color:var(--muted);font-weight:600;font-size:12px}
 .missing{color:#92400e}
 .muted{color:var(--muted);font-size:12px}
 ul{margin:6px 0;padding-left:18px}
 li{margin:2px 0}
 a{color:var(--brand)}
 .spark{display:block}
 .dot{cursor:pointer}
 .hidden{display:none}
</style></head>
<body>
<header>
 <h1>Thaleia — 施策設計 (成否リスクのスコア化)</h1>
 <div class="sub">企画を入れると UX / 実装コスト / AI 実装可否 / ドメイン解析 / Di 議論 の 5 軸でスコアと根拠が出ます。</div>
</header>
<main>
 <div id="notices"></div>

 <section id="listView">
  <h2>施策</h2>
  <div id="cards" class="cards"></div>

  <h3>新しい施策を登録</h3>
  <div class="panel">
   <div class="row" style="margin-bottom:8px">
    <input id="nTitle" placeholder="タイトル">
    <select id="nKind">
     <option value="new-content">new-content (新規制作)</option>
     <option value="improvement">improvement (改善・改修)</option>
    </select>
    <input id="nProject" placeholder="Anatomia project id">
    <input id="nRepoPath" placeholder="リポジトリのパス (任意 / Augur 用)">
    <input id="nGapId" placeholder="Discutere gapId (任意)">
    <input id="nGameId" placeholder="Ludus gameId (任意)">
   </div>
   <textarea id="nBody" placeholder="企画本文 (Markdown)"></textarea>
   <div class="row" style="margin-top:8px">
    <button id="btnCreate">登録する</button>
    <span id="createMsg" class="muted"></span>
   </div>
  </div>
 </section>

 <section id="detailView" class="hidden">
  <div class="row" style="margin-bottom:10px">
   <button class="ghost" id="btnBack">← 一覧へ</button>
   <button id="btnEvaluate">評価する</button>
   <span id="evalMsg" class="muted"></span>
  </div>
  <div id="detail"></div>
 </section>
</main>
<script>
var CFG={anatomia:false,discutere:false,augur:false,genius:false,ludus:false,confidenceHoldThreshold:0.5};
var CURRENT=null;

function el(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){
 return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function verdictLabel(v){
 return {go:'go (推進)',conditional:'conditional (条件付き)',defer:'defer (見送り)','no-go':'no-go'}[v]||v}
function verdictTag(v){return '<span class="verdict '+esc(v)+'">'+esc(verdictLabel(v))+'</span>'}
function pct(n){return Math.round((Number(n)||0)*100)+'%'}
function num(n){return (Math.round((Number(n)||0)*10)/10).toString()}
function axisLabel(a){
 return {ux:'UX',cost:'実装コスト','ai-feasibility':'AI 実装可否',domain:'ドメイン解析',discussion:'Di 議論'}[a]||a}

async function boot(){
 try{CFG=await (await fetch('/api/config')).json()}catch(e){/* 既定のまま */}
 renderNotices();
 await loadList();
}

function renderNotices(){
 var n=[];
 var off=[];
 if(!CFG.anatomia)off.push('Anatomia');
 if(!CFG.discutere)off.push('Discutere');
 if(!CFG.augur)off.push('Augur');
 if(!CFG.genius)off.push('Genius');
 if(!CFG.ludus)off.push('Ludus');
 if(off.length)n.push('<div class="notice warn">未設定の上流: '+esc(off.join(' / '))+
  '。 該当する軸は 0 点にせず missing として confidence を下げます。</div>');
 el('notices').innerHTML=n.join('');
}

async function loadList(){
 var r=await (await fetch('/api/initiatives')).json();
 var items=r.items||[];
 if(!items.length){el('cards').innerHTML='<div class="muted">まだ施策がありません。</div>';return}
 el('cards').innerHTML=items.map(function(it){
  var v=it.latest?verdictTag(it.latest.verdict):'<span class="muted">未評価</span>';
  var t=it.latest?('総合 '+num(it.latest.total)+' / confidence '+pct(it.latest.confidence)):'';
  return '<div class="card" data-id="'+esc(it.id)+'"><b>'+esc(it.title)+'</b>'+
   '<div class="meta">'+esc(it.kind)+' / '+esc(it.project)+'</div>'+
   '<div class="meta">'+v+' '+esc(t)+'</div>'+
   sparkline(it.history)+'</div>'}).join('');
 Array.prototype.forEach.call(document.querySelectorAll('.card'),function(c){
  c.addEventListener('click',function(){openDetail(c.getAttribute('data-id'))})});
}

/** total の推移を折れ線で出す (履歴 2 点以上のときだけ)。 */
function sparkline(history){
 if(!history||history.length<2)return '';
 var w=200,h=40,pad=4;
 var pts=history.map(function(p,i){
  var x=pad+(w-pad*2)*(history.length===1?0:i/(history.length-1));
  var y=h-pad-(h-pad*2)*((Number(p.total)||0)/100);
  return x.toFixed(1)+','+y.toFixed(1)}).join(' ');
 return '<svg class="spark" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'">'+
  '<polyline fill="none" stroke="#2a6df4" stroke-width="2" points="'+pts+'"></polyline></svg>';
}

async function openDetail(id){
 var r=await (await fetch('/api/initiatives/'+encodeURIComponent(id))).json();
 CURRENT=r;
 el('listView').classList.add('hidden');
 el('detailView').classList.remove('hidden');
 el('evalMsg').textContent='';
 renderDetail(r);
}

function renderDetail(r){
 var i=r.initiative,e=r.evaluation;
 var html='<div class="panel"><h2>'+esc(i.title)+'</h2>'+
  '<div class="muted">'+esc(i.kind)+' / project '+esc(i.project)+
  (i.repoPath?(' / repo '+esc(i.repoPath)):'')+'</div>';
 if(!e){
  html+='<p class="muted">まだ評価されていません。 「評価する」を押すと 5 軸を走らせます。</p></div>';
  el('detail').innerHTML=html;bindDots();return}

 html+='<div class="row" style="margin-top:10px">'+verdictTag(e.verdict)+
  '<b style="font-size:20px">'+num(e.total)+'</b><span class="muted">/ 100</span>'+
  '<span class="muted">confidence '+pct(e.confidence)+'</span>';
 if(r.diff&&r.diff.totalDelta!==null&&r.diff.totalDelta!==undefined){
  html+='<span class="muted">前回比 '+(r.diff.totalDelta>=0?'+':'')+num(r.diff.totalDelta)+'</span>'}
 html+='</div>';
 if(e.confidence<CFG.confidenceHoldThreshold){
  html+='<div class="notice warn">confidence が '+num(CFG.confidenceHoldThreshold)+
   ' 未満です。 上流の欠損が多いため判定は保留として扱ってください。</div>'}
 html+='</div>';

 html+='<div class="grid2" style="margin-top:14px">'+
  '<div class="panel"><h3>5 軸</h3>'+radar(e.axes)+axisTable(e.axes,r.diff)+'</div>'+
  '<div class="panel"><h3>減点理由</h3>'+list(e.reasons,'減点なし')+
  (e.verdict==='conditional'?('<h3>条件 (これを埋めれば go)</h3>'+list(e.conditions,'なし')):'')+
  '</div></div>';

 if(e.discussion){html+=discussionPanel(e.discussion)}
 if(e.degrade){html+=degradePanel(e.degrade)}
 if(e.banality){html+=banalityPanel(e.banality)}
 html+=evidencePanel(e);
 el('detail').innerHTML=html;
 bindDots();
}

function list(items,empty){
 if(!items||!items.length)return '<div class="muted">'+esc(empty)+'</div>';
 return '<ul>'+items.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul>'}

/** 5 軸レーダー。 外周 = 100 点。 */
function radar(axes){
 var size=260,cx=size/2,cy=size/2,r=95,n=axes.length;
 if(!n)return '';
 function point(idx,value){
  var a=-Math.PI/2+2*Math.PI*idx/n;
  var d=r*Math.max(0,Math.min(100,Number(value)||0))/100;
  return [cx+d*Math.cos(a),cy+d*Math.sin(a)]}
 var rings='';
 [25,50,75,100].forEach(function(level){
  var p=axes.map(function(a,i){var q=point(i,level);return q[0].toFixed(1)+','+q[1].toFixed(1)}).join(' ');
  rings+='<polygon points="'+p+'" fill="none" stroke="#e3e5ea"></polygon>'});
 var poly=axes.map(function(a,i){var q=point(i,a.score);return q[0].toFixed(1)+','+q[1].toFixed(1)}).join(' ');
 var labels=axes.map(function(a,i){
  var q=point(i,118);
  return '<text x="'+q[0].toFixed(1)+'" y="'+q[1].toFixed(1)+'" font-size="11" fill="#6b7280" '+
   'text-anchor="middle">'+esc(axisLabel(a.axis))+'</text>'}).join('');
 return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'+rings+
  '<polygon points="'+poly+'" fill="rgba(42,109,244,.22)" stroke="#2a6df4" stroke-width="2"></polygon>'+
  labels+'</svg>';
}

function axisTable(axes,diff){
 var deltas={};
 if(diff&&diff.axisDeltas){diff.axisDeltas.forEach(function(d){deltas[d.axis]=d.delta})}
 return '<table><thead><tr><th>軸</th><th>スコア</th><th>前回比</th><th>confidence</th><th>欠損</th></tr></thead><tbody>'+
  axes.map(function(a){
   var d=deltas[a.axis];
   return '<tr><td>'+esc(axisLabel(a.axis))+'</td><td>'+num(a.score)+'</td>'+
    '<td>'+(d===undefined||d===null?'-':((d>=0?'+':'')+num(d)))+'</td>'+
    '<td>'+pct(a.confidence)+'</td>'+
    '<td class="missing">'+(a.missing&&a.missing.length?esc(a.missing.length+' 件'):'-')+'</td></tr>'}).join('')+
  '</tbody></table>';
}

/** Di 四象限。 点 = ペルソナ、 サイズ = 内部スコア、 色 = pass/fail。 */
function discussionPanel(d){
 var size=360,pad=34,inner=size-pad*2;
 function px(v){return pad+inner*((Math.max(-1,Math.min(1,Number(v)||0))+1)/2)}
 function py(v){return pad+inner*(1-(Math.max(-1,Math.min(1,Number(v)||0))+1)/2)}
 var dots=(d.personas||[]).map(function(p,idx){
  var rr=6+10*(Math.max(0,Math.min(100,Number(p.internal)||0))/100);
  return '<circle class="dot" data-persona="'+idx+'" cx="'+px(p.feasibility).toFixed(1)+'" cy="'+
   py(p.experienceValue).toFixed(1)+'" r="'+rr.toFixed(1)+'" fill="'+(p.pass?'#1f8a4c':'#c0392b')+
   '" fill-opacity=".65" stroke="#fff"><title>'+esc(p.displayName)+' / 内部 '+num(p.internal)+
   ' / 閾値 '+num(p.threshold)+'</title></circle>'}).join('');
 var axesSvg='<line x1="'+pad+'" y1="'+(size/2)+'" x2="'+(size-pad)+'" y2="'+(size/2)+
   '" stroke="#e3e5ea"></line>'+
  '<line x1="'+(size/2)+'" y1="'+pad+'" x2="'+(size/2)+'" y2="'+(size-pad)+'" stroke="#e3e5ea"></line>'+
  '<text x="'+(size-pad)+'" y="'+(size/2-8)+'" font-size="11" fill="#6b7280" text-anchor="end">実現性 高</text>'+
  '<text x="'+pad+'" y="'+(size/2-8)+'" font-size="11" fill="#6b7280">実現性 低</text>'+
  '<text x="'+(size/2+6)+'" y="'+(pad-10)+'" font-size="11" fill="#6b7280">体験価値 高</text>'+
  '<text x="'+(size/2+6)+'" y="'+(size-pad+16)+'" font-size="11" fill="#6b7280">体験価値 低</text>'+
  '<text x="'+(size/2+10)+'" y="'+(pad+14)+'" font-size="11" fill="#9aa3b2">I 推進</text>'+
  '<text x="'+(pad+4)+'" y="'+(pad+14)+'" font-size="11" fill="#9aa3b2">II 条件付き</text>'+
  '<text x="'+(size/2+10)+'" y="'+(size-pad-4)+'" font-size="11" fill="#9aa3b2">III 再考</text>'+
  '<text x="'+(pad+4)+'" y="'+(size-pad-4)+'" font-size="11" fill="#9aa3b2">IV 却下</text>';
 var counts=d.quadrantCounts||{};
 return '<div class="panel" style="margin-top:14px"><h3>Di 四象限 (点 = ペルソナ / サイズ = 内部スコア / 色 = 単独合否)</h3>'+
  '<div class="grid2"><div><svg id="quadrant" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'+
  axesSvg+dots+'</svg>'+
  '<div class="muted">I '+(counts.I||0)+' / II '+(counts.II||0)+' / III '+(counts.III||0)+
  ' / IV '+(counts.IV||0)+(d.gapId?(' / gapId '+esc(d.gapId)):'')+'</div></div>'+
  '<div><div id="personaDetail" class="muted">点をクリックすると内訳と発話が出ます。</div>'+
  personaTable(d.personas)+'</div></div></div>';
}

function personaTable(personas){
 if(!personas||!personas.length)return '<div class="muted">ペルソナがいません。</div>';
 return '<table style="margin-top:10px"><thead><tr><th>ペルソナ</th><th>象限</th><th>内部</th><th>閾値</th><th>合否</th></tr></thead><tbody>'+
  personas.map(function(p,idx){
   return '<tr><td><a href="#" class="dot" data-persona="'+idx+'">'+esc(p.displayName)+'</a></td>'+
    '<td>'+esc(p.quadrant)+'</td><td>'+num(p.internal)+'</td><td>'+num(p.threshold)+'</td>'+
    '<td style="color:'+(p.pass?'#1f8a4c':'#c0392b')+'">'+(p.pass?'pass':'fail')+'</td></tr>'}).join('')+
  '</tbody></table>';
}

function bindDots(){
 Array.prototype.forEach.call(document.querySelectorAll('.dot'),function(d){
  d.addEventListener('click',function(ev){
   ev.preventDefault();
   showPersona(Number(d.getAttribute('data-persona')))})});
}

function showPersona(idx){
 var e=CURRENT&&CURRENT.evaluation;
 if(!e||!e.discussion)return;
 var p=e.discussion.personas[idx];
 if(!p)return;
 var b=p.breakdown||{};
 var html='<div class="panel"><b>'+esc(p.displayName)+'</b>'+
  '<div class="muted">traits: '+esc((p.traits||[]).join(', ')||'(なし)')+'</div>'+
  '<div class="muted">内部スコア '+num(p.internal)+' = opinion '+pct(b.opinion)+
  ' / consensus '+pct(b.consensus)+' / traitFit '+pct(b.traitFit)+
  ' → 閾値 '+num(p.threshold)+' に対し '+(p.pass?'pass':'fail')+'</div>'+
  '<div class="muted">象限 '+esc(p.quadrant)+' (実現性 '+num(p.feasibility)+' / 体験価値 '+num(p.experienceValue)+')</div>'+
  '<h3>発話</h3><ul>'+
  (p.utterances||[]).map(function(u){
   return '<li>'+esc(u.content)+' <span class="muted">'+
    (u.agree===null?'(未採点)':(u.agree?'(同意)':'(不同意)'))+
    (u.score===null||u.score===undefined?'':(' score '+num(u.score)))+'</span></li>'}).join('')+
  '</ul></div>';
 el('personaDetail').innerHTML=html;
}

function degradePanel(g){
 var b=g.breakdown||{};
 return '<div class="panel" style="margin-top:14px"><h3>デグレード危険度 '+num(g.risk*100)+'% </h3>'+
  '<table><tbody>'+
  '<tr><th>fan-in</th><td>'+pct(b.fanIn)+'</td></tr>'+
  '<tr><th>hotspot 度</th><td>'+pct(b.hotspot)+'</td></tr>'+
  '<tr><th>回帰テスト充足率</th><td>'+pct(b.regressionCoverage)+'</td></tr>'+
  '<tr><th>二層不整合</th><td>'+pct(b.layerMismatch)+'</td></tr>'+
  '</tbody></table>'+
  '<h3>Augur が要求した検査</h3>'+list(g.requiredChecks,'(取得できていない)')+
  '<h3>先に返済</h3>'+
  ((g.repayFirst&&g.repayFirst.length)?
   ('<ul>'+g.repayFirst.map(function(x){
     return '<li>['+esc(x.kind)+'] '+esc(x.label)+(x.detail?(' — '+esc(x.detail)):'')+'</li>'}).join('')+'</ul>'):
   '<div class="muted">なし</div>')+
  missingList(g.missing)+
  '</div>';
}

function banalityPanel(b){
 return '<div class="panel" style="margin-top:14px"><h3>凡庸性 '+pct(b.banality)+
  ' (ペナルティ −'+num(b.penalty)+' 点 / 判定方式 '+esc(b.method)+')</h3>'+
  ((b.matches&&b.matches.length)?
   ('<table><thead><tr><th>既存パターン</th><th>出どころ</th><th>類似度</th></tr></thead><tbody>'+
    b.matches.map(function(m){
     return '<tr><td>'+esc(m.pattern)+'</td><td>'+esc(m.source)+'</td><td>'+pct(m.similarity)+'</td></tr>'}).join('')+
    '</tbody></table>'):
   ((b.missing&&b.missing.length)?
    '<div class="missing">参照データが欠損しているため新規性を判定できません。</div>':
    '<div class="muted">既存パターンに当たりませんでした (新規性が高い)。</div>'))+
  missingList(b.missing)+
  '</div>';
}

function missingList(items){
 if(!items||!items.length)return '';
 return '<h3>欠損</h3><ul class="missing">'+items.map(function(m){
  return '<li>'+esc(m.code)+' — '+esc(m.reason)+'</li>'}).join('')+'</ul>';
}

function evidencePanel(evaluation){
 var rows=[];
 (evaluation.axes||[]).forEach(function(a){
  (a.evidence||[]).forEach(function(ev){
   rows.push('<tr><td>'+esc(axisLabel(a.axis))+'</td><td>'+esc(ev.source)+'</td><td>'+
    (ev.url?('<a href="'+esc(ev.url)+'" target="_blank" rel="noreferrer">'+esc(ev.label)+'</a>'):esc(ev.label))+
    '</td><td class="muted">'+esc(ev.detail||'')+'</td></tr>')});
  (a.missing||[]).forEach(function(m){
   rows.push('<tr><td>'+esc(axisLabel(a.axis))+'</td><td class="missing">missing</td><td>'+esc(m.code)+
    '</td><td class="muted">'+esc(m.reason)+'</td></tr>')})});
 [['凡庸性ルール',evaluation.banality],['デグレードルール',evaluation.degrade]].forEach(function(pair){
  var result=pair[1];
  (result&&result.missing||[]).forEach(function(m){
   rows.push('<tr><td>'+esc(pair[0])+'</td><td class="missing">missing</td><td>'+esc(m.code)+
    '</td><td class="muted">'+esc(m.reason)+'</td></tr>')})});
 return '<div class="panel" style="margin-top:14px"><h3>根拠 (evidence / missing)</h3>'+
  '<table><thead><tr><th>軸</th><th>出どころ</th><th>内容</th><th>詳細</th></tr></thead><tbody>'+
  rows.join('')+'</tbody></table></div>';
}

el('btnBack').addEventListener('click',function(){
 el('detailView').classList.add('hidden');
 el('listView').classList.remove('hidden');
 loadList()});

el('btnEvaluate').addEventListener('click',async function(){
 if(!CURRENT)return;
 el('evalMsg').textContent='評価中… (LLM と上流を呼ぶので時間がかかります)';
 try{
  var res=await fetch('/api/initiatives/'+encodeURIComponent(CURRENT.initiative.id)+'/evaluate',{method:'POST'});
  var j=await res.json();
  if(!res.ok){el('evalMsg').textContent='失敗: '+(j.detail||j.error||res.status);return}
  el('evalMsg').textContent='';
  await openDetail(CURRENT.initiative.id)}
 catch(e){el('evalMsg').textContent='失敗: '+e}});

el('btnCreate').addEventListener('click',async function(){
 var payload={
  title:el('nTitle').value.trim(),
  kind:el('nKind').value,
  project:el('nProject').value.trim(),
  body:el('nBody').value,
  repoPath:el('nRepoPath').value.trim()||undefined,
  discutere:el('nGapId').value.trim()?{gapId:el('nGapId').value.trim()}:undefined,
  ludus:el('nGameId').value.trim()?{gameId:el('nGameId').value.trim()}:undefined};
 el('createMsg').textContent='登録中…';
 try{
  var res=await fetch('/api/initiatives',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify(payload)});
  var j=await res.json();
  if(!res.ok){el('createMsg').textContent='失敗: '+(j.hint||j.error||res.status);return}
  el('createMsg').textContent='登録しました。';
  el('nTitle').value='';el('nBody').value='';
  await loadList()}
 catch(e){el('createMsg').textContent='失敗: '+e}});

boot();
</script>
</body></html>`;
