// Wiki looks: 0 = neutral house look (only with ?look=0), 1 = look A (light), 2 = look B (dark). looks.js
// (written by scripts/lookgen.mjs) sets window.WIKI_LOOKS.
// All text is >= 7:1 (WCAG AAA) on every surface, control borders >= 3:1. One family per look.
(function(){
// Falls back to the house look when looks.js is missing.
const LOOKS=window.WIKI_LOOKS||[{dark:false,f:"'Inter'",v:{paper:"#F5F4F0",panel:"#FFFFFF",raise:"#FFFFFF",ink:"#151515",body:"#272626",mute:"#4C4B48",rule:"#E2E0DA",line:"#8B8985",acc:"#1F5C99",sel:"#EAE8E2"}}];
const q=new URLSearchParams(location.search).get('look');
// Without ?look=, a page wears the last wiki look the reader saw (pricing and account follow the wiki).
let last=null;try{last=sessionStorage.getItem('wiki.look')}catch(e){}
const pick=q!==null?q:(last!==null?last:null);
const n=pick===null?(window.DEFAULT_LOOK??1):Math.max(0,Math.min(LOOKS.length-1,+pick||0));
try{if(n>0)sessionStorage.setItem('wiki.look',String(n))}catch(e){}
const t=LOOKS[n],s=document.documentElement.style;
for(const k in t.v)s.setProperty('--'+k,t.v[k]);
s.setProperty('--f',t.f+', system-ui, sans-serif');
document.documentElement.dataset.mode=t.dark?'dark':'light';window.LOOK=n;
})();
