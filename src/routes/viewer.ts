// 最小 HTML ビューア。 突合を実行して結果を表で見るだけの素朴な SPA (ビルド不要)。

export const VIEWER_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>Thaleia — 突合</title>
<style>
 body{font-family:system-ui,"Yu Gothic UI",sans-serif;max-width:980px;margin:24px auto;padding:0 16px;color:#1d2230}
 h1{font-size:18px} .muted{color:#6b7280;font-size:12px}
 form{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
 input{padding:8px 10px;border:1px solid #e3e5ea;border-radius:8px}
 button{padding:8px 16px;border:1px solid #2a6df4;background:#2a6df4;color:#fff;border-radius:8px;cursor:pointer}
 table{border-collapse:collapse;width:100%;margin:10px 0;font-size:13px}
 th,td{border:1px solid #e3e5ea;padding:6px 8px;text-align:left}
 th{background:#f6f7f9}
 .matched{color:#1f8a4c}.name-mismatch{color:#b8860b}.spec-only{color:#c0392b}.code-only{color:#8e44ad}
 .yes{color:#1f8a4c;font-weight:600}.no{color:#c0392b;font-weight:600}
 .cards{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0}
 .card{border:1px solid #e3e5ea;border-radius:8px;padding:8px 12px;min-width:120px}
 .card b{font-size:20px;display:block}
</style></head><body>
<h1>Thaleia — ドメイン↔仕様書 突合</h1>
<p class="muted">Praeforma(人間の仕様) と Anatomia(コード解析) を突合します。</p>
<form id="f">
 <input id="label" placeholder="表示名 (例: PrivateGame)" required>
 <input id="pf" placeholder="Praeforma project id" required>
 <input id="an" placeholder="Anatomia project id (省略可)">
 <button>突合する</button>
</form>
<div id="out"></div>
<script>
const $=s=>document.querySelector(s);
function esc(s){return String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function render(r){
 const dm=r.domainMatches.map(m=>'<tr><td>'+esc(m.pfDomain)+'</td><td>'+esc(m.anatomiaDomain)+'</td><td class="'+m.status+'">'+m.status+'</td></tr>').join('');
 const sc=r.specCoverage.map(s=>'<tr><td>'+esc(s.specCode)+'</td><td>'+esc(s.specTitle)+'</td><td>'+esc(s.targetDomains.join(', '))+'</td><td class="'+(s.implemented?'yes':'no')+'">'+(s.implemented?'実装あり':'未実装')+'</td><td class="muted">'+esc(s.evidence)+'</td></tr>').join('');
 const su=r.summary;
 $('#out').innerHTML=
  '<p class="muted">generatedAt: '+esc(r.generatedAt)+'</p>'+
  '<div class="cards">'+
   card('Pfドメイン',su.pfDomains)+card('実装ドメイン',su.anatomiaDomains)+card('一致',su.matchedDomains)+
   card('仕様',su.specs)+card('実装済仕様',su.implementedSpecs)+'</div>'+
  '<h3>ドメイン突合</h3><table><tr><th>Praeforma(仕様)</th><th>Anatomia(実装)</th><th>状態</th></tr>'+dm+'</table>'+
  '<h3>仕様カバレッジ</h3><table><tr><th>code</th><th>title</th><th>target</th><th>実装</th><th>根拠</th></tr>'+sc+'</table>'+
  '<h3>ギャップ</h3><p class="no">未実装の仕様: '+esc(r.gaps.specsWithoutImpl.join(', ')||'なし')+'</p>'+
  '<p class="code-only">仕様の無い実装ドメイン: '+esc(r.gaps.codeDomainsWithoutSpec.join(', ')||'なし')+'</p>';
}
function card(t,v){return '<div class="card">'+esc(t)+'<b>'+esc(v)+'</b></div>'}
$('#f').onsubmit=async e=>{
 e.preventDefault();$('#out').textContent='突合中…';
 try{
  const res=await fetch('/reconcile',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({label:$('#label').value,pf_project:$('#pf').value,anatomia_project:$('#an').value||undefined})});
  const j=await res.json();
  if(!res.ok){$('#out').innerHTML='<p class="no">エラー: '+esc(j.error)+' '+esc(j.hint||j.detail||'')+'</p>';return}
  render(j);
 }catch(err){$('#out').innerHTML='<p class="no">'+esc(err)+'</p>'}
};
</script></body></html>`;
