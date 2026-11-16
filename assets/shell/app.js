// Wiki shell interactions: every control has a real, visible state. No network; the only
// storage is the sound mute setting, shared with the glossary (soundkit.js, same key).
(function(){
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const ROOT=document.documentElement.dataset.root||'';
document.addEventListener('DOMContentLoaded',()=>{
 // keep the wiki's look on every journey link
 $$('a[data-keep]').forEach(a=>{const u=new URL(a.getAttribute('href'),location.href);u.searchParams.set('look',window.LOOK);a.href=u.href});
 // sound: off until the first click or key, silent under reduced motion, never autoplays
 const K=window.SoundKit&&SoundKit.createSoundKit({storageKey:'soundkit.muted',defaultMuted:false,volumeDb:-24});
 const pan=el=>{if(!el)return 0;const r=el.getBoundingClientRect();return Math.max(-1,Math.min(1,((r.left+r.width/2)/innerWidth)*2-1))};
 const snd=(n,el)=>K&&K.play(n,{pan:pan(el)});
 window.wikiSound=K; // read by the self-check (plays per sound)
 if(K){
  const syncSound=()=>{
   $$('[data-sound-toggle]').forEach(b=>{const rm=K.reducedMotion;b.setAttribute('aria-pressed',String(K.muted||rm));
    rm?b.setAttribute('aria-disabled','true'):b.removeAttribute('aria-disabled');
    b.title=rm?'Sound is off while reduced motion is on':K.muted?'Sound off':'Sound on';b.setAttribute('aria-label',rm?b.title:'Mute sound')});
   const f=document.getElementById('g3d');f&&f.contentWindow&&f.contentWindow.postMessage({type:'wiki:sound',muted:K.muted},location.protocol==='file:'?'*':location.origin)};
  $$('[data-sound-toggle]').forEach(b=>b.addEventListener('click',()=>{if(b.getAttribute('aria-disabled')==='true')return;K.toggleMuted();snd('toggle',b)}));
  K.subscribe(syncSound);syncSound();
  const g=document.getElementById('g3d');g&&g.addEventListener('load',syncSound);
  document.addEventListener('pointerover',e=>{const a=e.target.closest('a.dt,a.tag,.tl a,.res a');if(a&&!a.contains(e.relatedTarget))snd('tick',a)});
  // a lesson turning ready (data-lesson-state) gets one chime
  new MutationObserver(ms=>ms.forEach(m=>{if(m.target.dataset.lessonState==='ready'&&m.oldValue!=='ready')snd('chime',m.target)})).observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-lesson-state'],attributeOldValue:true});
 }
 // source filter (sidebar, chips): pressed state + section counts + page hook
 const W=window.WIKI;
 const count=(sec,src)=>W?W.terms.map(t=>W.byId[t[0]]).filter(t=>t&&(!sec||t.sec===sec)&&(!src||t.src.includes(src))).length:0;
 let src=new URLSearchParams(location.search).get('src')||'';
 const paint=()=>{
  $$('[data-src]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.src===src)));
  $$('[data-cn]').forEach(e=>e.textContent=count(e.dataset.cn==='all'?null:e.dataset.cn,src||null));
  $$('[data-cz]').forEach(e=>e.classList.toggle('zero',!count(e.dataset.cz,src||null)));
  $$('[data-sn]').forEach(e=>e.textContent=count(null,e.dataset.sn==='all'?null:e.dataset.sn));
  $$('a[data-keep]').forEach(a=>{const u=new URL(a.href);src?u.searchParams.set('src',src):u.searchParams.delete('src');a.href=u.href});
  window.onFilter&&window.onFilter(src);
 };
 $$('[data-src]').forEach(b=>b.addEventListener('click',()=>{if(src!==b.dataset.src)snd('whoosh',b);src=b.dataset.src;const u=new URL(location.href);src?u.searchParams.set('src',src):u.searchParams.delete('src');history.replaceState(null,'',u);paint()}));
 window.setSrc=v=>{if(src!==v)snd('whoosh');src=v;paint()};
 if(W)paint();
 // search
 const q=$('#q'),res=$('#res');
 if(q&&res&&W){
  const run=()=>{const v=q.value.trim().toLowerCase();if(!v){res.classList.remove('on');q.setAttribute('aria-expanded','false');return}
   const hits=Object.values(W.byId).filter(t=>t.name.toLowerCase().includes(v)).slice(0,6);
   res.innerHTML=hits.length?hits.map(t=>`<a role="option" href="${ROOT}glossary.html?look=${window.LOOK}&term=${t.id}">${t.name}<span>${t.src.map(s=>(W.sources.find(x=>x.id===s)||{name:s}).name).join(' + ')}</span></a>`).join(''):'<div class="none">No terms match</div>';
   res.classList.add('on');q.setAttribute('aria-expanded','true')};
  q.addEventListener('input',run);q.addEventListener('focus',run);
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();q.focus()}if(e.key==='Escape'){res.classList.remove('on')}});
  document.addEventListener('click',e=>{if(!e.target.closest('.search'))res.classList.remove('on')});
 }
 // mobile drawer
 const dr=$('.drawer'),sc=$('.scrimd');
 const setDr=o=>{if(!dr)return;dr.classList.toggle('open',o);sc.classList.toggle('open',o);$$('[data-act=menu]').forEach(b=>b.setAttribute('aria-expanded',String(o)))};
 $$('[data-act=menu]').forEach(b=>b.addEventListener('click',()=>setDr(!dr.classList.contains('open'))));
 sc&&sc.addEventListener('click',()=>setDr(false));
 document.addEventListener('keydown',e=>e.key==='Escape'&&setDr(false));
 // generic disclosure buttons (notes, confirm panels)
 $$('[data-act=toggle]').forEach(b=>b.addEventListener('click',()=>{const t=document.getElementById(b.getAttribute('aria-controls'));const o=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(o));t.hidden=!o}));
 // revoke / sign out
 $$('[data-act=revoke]').forEach(b=>b.addEventListener('click',()=>{b.textContent=b.dataset.done;b.setAttribute('aria-disabled','true');b.disabled=true;const s=b.closest('.row').querySelector('.st');if(s)s.textContent='Ended just now'}));
 // typed confirmation
 $$('[data-confirm]').forEach(i=>{const b=document.getElementById(i.dataset.confirm);i.addEventListener('input',()=>{const ok=i.value.trim().toLowerCase()==='delete';b.disabled=!ok;b.setAttribute('aria-disabled',String(!ok))})});
 $$('[data-act=delete]').forEach(b=>b.addEventListener('click',()=>{b.closest('.conf').hidden=true;document.getElementById('done').hidden=false;const t=document.querySelector('[aria-controls=cf]');t.disabled=true;t.setAttribute('aria-disabled','true');t.textContent='Deleted'}));
 // lesson: sort (segmented choices) + check
 $$('.seg2').forEach(g=>$$('button',g).forEach(b=>b.addEventListener('click',()=>{$$('button',g).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));g.closest('.srow').classList.remove('ok','no')})));
 const chk=$('#check');
 chk&&chk.addEventListener('click',()=>{let n=0,t=0;$$('.srow').forEach(r=>{t++;const p=$('[aria-pressed=true]',r);r.classList.remove('ok','no');if(!p)return;const ok=p.dataset.v===r.dataset.a;r.classList.add(ok?'ok':'no');n+=ok});$('#score').textContent=`${n} of ${t} right`});
 // quiz feedback
 $$('.q fieldset').forEach(f=>$$('input',f).forEach(i=>i.addEventListener('change',()=>{$$('label',f).forEach(l=>l.classList.toggle('pick',l.contains(i)));const fb=$('.fb',f);fb.hidden=false;fb.textContent=i.dataset.ok?'Right. '+f.dataset.why:'Not quite. '+f.dataset.why;fb.classList.toggle('bad',!i.dataset.ok)})));
 // lesson rail follows the reader
 const rl=$$('.rail a');if(rl.length&&'IntersectionObserver'in window){const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)rl.forEach(a=>a.getAttribute('href')==='#'+e.target.id?a.setAttribute('aria-current','step'):a.removeAttribute('aria-current'))}),{rootMargin:'-30% 0px -60% 0px'});$$('.st').forEach(s=>io.observe(s))}
 // menus built on <details>: close on outside click
 document.addEventListener('click',e=>$$('details.menu[open]').forEach(d=>{if(!d.contains(e.target))d.open=false}));
});
})();
