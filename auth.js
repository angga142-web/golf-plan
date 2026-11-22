/* Parkutut sign in (23 Nov 2026), shared by every page.
   Three ways in, no password yet: phone number, Gmail, or guest.
   - Phone/Gmail: the number or address is turned into a SHA-256 code in the browser; only that code, a masked label and the golf data
     (round history, swing history, quiz results, club distances) go to api/data.php on parkutut.com. Synced on page load, after a save
     and when the page is hidden.
   - Guest: nothing goes to the server. Guest data is wiped when the guest leaves (Keluar) or opens the app again in a new session.
   Later this moves to Firebase (Google sign in + SMS code). */
(function(){
const UKEY="parkutut-user-v1",SKEY="parkutut-session-v1",API="api/data.php";
const ARR={"caddy-history-v1":"id","swinglab-history-v1":"d","parkutut-quiz-v1":"id"};   // arrays merged by their id field
const KEEP=["caddy-clubs-v1","caddy-name-v1"];                                            // single values: this phone wins, the server fills in
const ls={get:k=>{try{return localStorage.getItem(k);}catch(e){return null;}},set:(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}},del:k=>{try{localStorage.removeItem(k);}catch(e){}}};
const ss={get:k=>{try{return sessionStorage.getItem(k);}catch(e){return null;}},set:(k,v)=>{try{sessionStorage.setItem(k,v);}catch(e){}}};
const j=(s,d)=>{try{const v=JSON.parse(s);return v==null?d:v;}catch(e){return d;}};
let remote=null,timer=null,busy=false;

function user(){return j(ls.get(UKEY),null);}
const isAccount=()=>{const u=user();return !!(u&&u.type!=="guest");};
function wipeLocal(){Object.keys(ARR).concat(KEEP,["parkutut-sg-best","caddy-caddyname-v1"]).forEach(ls.del);
  try{Object.keys(localStorage).forEach(k=>{if(/^caddy-.+-v1$/.test(k)){const v=j(localStorage.getItem(k),null);if(v&&typeof v==="object"&&v.holes)localStorage.removeItem(k);}});}catch(e){}}   // round in progress
/* a guest who comes back in a new session starts clean */
(function(){const u=user();if(u&&u.type==="guest"&&!ss.get(SKEY)){wipeLocal();ls.del(UKEY);}if(user())ss.set(SKEY,"1");})();

function normPhone(s){let d=String(s).replace(/\D/g,"");if(d.startsWith("0"))d="62"+d.slice(1);else if(d.startsWith("8"))d="62"+d;return /^62\d{8,13}$/.test(d)?d:null;}
function normMail(s){const m=String(s).trim().toLowerCase();return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(m)?m:null;}
async function hash(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("parkutut:"+s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");}
const maskPhone=d=>"+"+d.slice(0,2)+" "+d.slice(2,5)+"••••"+d.slice(-3);
const maskMail=m=>{const[a,b]=m.split("@");return a.slice(0,2)+"•••@"+b;};

async function api(body,keep){const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),keepalive:!!keep,cache:"no-store"});
  if(!r.ok)throw new Error("api "+r.status);return r.json();}
function merged(server){const out={label:(user()||{}).label||"",type:(user()||{}).type||""};
  Object.entries(ARR).forEach(([k,id])=>{const m=new Map();(j(ls.get(k),[])||[]).concat(server&&server[k]||[]).forEach(e=>{if(e&&e[id]!=null&&!m.has(e[id]))m.set(e[id],e);});
    const a=[...m.values()].sort((x,y)=>y[id]-x[id]).slice(0,200);out[k]=a;ls.set(k,JSON.stringify(a));});
  KEEP.forEach(k=>{const v=ls.get(k);if(v!=null)out[k]=v;else if(server&&server[k]!=null){out[k]=server[k];ls.set(k,server[k]);}});
  const best=Math.max(+ls.get("parkutut-sg-best")||0,+(server&&server["parkutut-sg-best"])||0);if(best){out["parkutut-sg-best"]=best;ls.set("parkutut-sg-best",best);}
  return out;}
/* pull, merge, push. Returns true when the server has this phone's data */
async function sync(){const u=user();if(!u||u.type==="guest"||busy)return false;busy=true;
  try{const g=await api({action:"get",id:u.id});remote=g.data||{};const m=merged(remote);await api({action:"put",id:u.id,data:m});remote=m;
    window.dispatchEvent(new Event("parkutut-synced"));return true;}catch(e){return false;}finally{busy=false;}}
function syncSoon(){if(!isAccount())return;clearTimeout(timer);timer=setTimeout(sync,1500);}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden"&&isAccount()&&remote){const u=user();try{api({action:"put",id:u.id,data:merged(remote)},true).catch(()=>{});}catch(e){}}});

async function signIn(type,value){let norm,label;
  if(type==="phone"){norm=normPhone(value);if(!norm)return "Nomor HP belum benar. Contoh: 0812 3456 7890";label=maskPhone(norm);}
  else{norm=normMail(value);if(!norm)return "Alamat Gmail belum benar. Contoh: nama@gmail.com";label=maskMail(norm);}
  const id=await hash(type+":"+norm),prev=user();
  if(prev&&prev.type!=="guest"&&prev.id!==id)wipeLocal();          // another account was on this phone: its data stays on the server
  ls.set(UKEY,JSON.stringify({type,id,label}));ss.set(SKEY,"1");   // a guest's data on this phone moves into the account
  return await sync()?null:"Masuk, tapi belum tersambung ke server. Data akan disimpan begitu ada sinyal.";}
function guest(){if(isAccount())wipeLocal();ls.set(UKEY,JSON.stringify({type:"guest",label:"Guest"}));ss.set(SKEY,"1");}
async function signOut(){const u=user();if(!u)return;if(u.type==="guest")wipeLocal();else{await sync();wipeLocal();}ls.del(UKEY);remote=null;}

/* ---------- the sign in sheet ---------- */
const CSS=`.pk-bg{position:fixed;inset:0;z-index:9999;background:rgba(12,22,45,.72);display:flex;align-items:flex-end;justify-content:center;font-family:"Barlow",system-ui,-apple-system,"Segoe UI",sans-serif;color:#0c162d}
.pk-box{width:100%;max-width:440px;background:#fff;border-radius:20px 20px 0 0;padding:20px 16px calc(20px + env(safe-area-inset-bottom,0px));max-height:92vh;overflow:auto}
@media(min-width:600px){.pk-bg{align-items:center}.pk-box{border-radius:20px}}
.pk-box h2{margin:0 0 4px;font:800 26px/1.1 "Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase}
.pk-box p{margin:0 0 14px;color:#46506a;font-size:15px;line-height:1.4}
.pk-opts{display:grid;gap:8px}
.pk-opts button,.pk-go{font-family:inherit;font-weight:700;font-size:17px;display:flex;align-items:center;gap:12px;width:100%;padding:14px;border:2px solid #d3d9e2;border-radius:14px;background:#fff;color:#0c162d;cursor:pointer;text-align:left}
.pk-opts button[aria-pressed=true]{border-color:#0c162d;background:#eef1f5}
.pk-opts small{display:block;font-weight:500;font-size:13px;color:#46506a}
.pk-ic{flex:none;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff}
.pk-form{margin-top:12px;display:grid;gap:8px}
.pk-form input{font-family:inherit;font-weight:600;font-size:18px;padding:13px 14px;border:2px solid #d3d9e2;border-radius:12px;width:100%;color:#0c162d}
.pk-form input:focus{outline:none;border-color:#0047af}
.pk-go{justify-content:center;background:#ffc400;border-color:#ffc400;font:800 20px "Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:.5px}
.pk-go:disabled{opacity:.5}
.pk-warn{background:#fdecee;border:1px solid #f3b8c0;color:#8a0f22;border-radius:12px;padding:12px;font-size:14px;line-height:1.4}
.pk-note{font-size:12px;color:#6b7590;margin:12px 0 0}
.pk-err{color:#d2142d;font-weight:700;font-size:14px;min-height:1em}
.pk-later{display:block;margin:12px auto 0;background:none;border:0;color:#46506a;font-family:inherit;font-weight:600;font-size:15px;text-decoration:underline;cursor:pointer}`;
function prompt(opt){opt=opt||{};if(document.querySelector(".pk-bg"))return;
  if(!document.getElementById("pk-css")){const st=document.createElement("style");st.id="pk-css";st.textContent=CSS;document.head.appendChild(st);}
  const bg=document.createElement("div");bg.className="pk-bg";bg.setAttribute("role","dialog");bg.setAttribute("aria-modal","true");bg.setAttribute("aria-labelledby","pk-t");
  const g=user()&&user().type==="guest";
  bg.innerHTML='<div class="pk-box"><h2 id="pk-t">'+(opt.title||"Masuk ke Parkutut")+'</h2><p>'+(opt.reason||"Simpan riwayat ronde, analisa swing, dan statistik pukulan kamu.")+'</p>'
    +'<div class="pk-opts"><button type="button" data-t="phone" aria-pressed="false"><span class="pk-ic" style="background:#0b7a3a">HP</span><span>Nomor HP<small>Contoh 0812 3456 7890</small></span></button>'
    +'<button type="button" data-t="gmail" aria-pressed="false"><span class="pk-ic" style="background:#d2142d">G</span><span>Gmail<small>nama@gmail.com</small></span></button>'
    +(g?'':'<button type="button" data-t="guest" aria-pressed="false"><span class="pk-ic" style="background:#46506a">?</span><span>Guest<small>Coba dulu tanpa menyimpan data</small></span></button>')+'</div>'
    +'<div class="pk-form" id="pk-form" hidden></div>'
    +'<p class="pk-note">Belum pakai password. Nomor HP atau Gmail kamu diubah jadi kode acak sebelum dikirim, jadi tidak tersimpan di server. Pakai nomor atau Gmail milikmu sendiri.</p>'
    +(opt.closable===false?'':'<button type="button" class="pk-later">Nanti saja</button>')+'</div>';
  document.body.appendChild(bg);
  const form=bg.querySelector("#pk-form"),close=()=>{bg.remove();if(opt.onDone)opt.onDone(user());};
  bg.querySelector(".pk-opts").addEventListener("click",ev=>{const b=ev.target.closest("[data-t]");if(!b)return;const t=b.dataset.t;
    bg.querySelectorAll(".pk-opts button").forEach(x=>x.setAttribute("aria-pressed",x===b));form.hidden=false;
    if(t==="guest"){form.innerHTML='<div class="pk-warn"><b>Mode guest: data tidak disimpan.</b> Ronde, analisa swing, dan hasil quiz hanya ada selama kamu main, lalu dihapus saat kamu keluar atau membuka aplikasi lagi nanti.</div><button type="button" class="pk-go">Lanjut sebagai guest</button>';
      form.querySelector(".pk-go").addEventListener("click",()=>{guest();close();});form.querySelector(".pk-go").focus();return;}
    form.innerHTML='<input id="pk-in" '+(t==="phone"?'type="tel" inputmode="tel" autocomplete="tel" placeholder="0812 3456 7890"':'type="email" inputmode="email" autocomplete="email" placeholder="nama@gmail.com"')+' aria-label="'+(t==="phone"?"Nomor HP":"Gmail")+'"><div class="pk-err" id="pk-err" role="alert"></div><button type="button" class="pk-go">Masuk</button>';
    const inp=form.querySelector("#pk-in"),go=form.querySelector(".pk-go"),err=form.querySelector("#pk-err");inp.focus();
    const submit=async()=>{go.disabled=true;go.textContent="Menyimpan…";const e=await signIn(t,inp.value);go.disabled=false;go.textContent="Masuk";
      if(e&&!/^Masuk,/.test(e)){err.textContent=e;return;}close();};
    go.addEventListener("click",submit);inp.addEventListener("keydown",ev2=>{if(ev2.key==="Enter")submit();});});
  const later=bg.querySelector(".pk-later");if(later)later.addEventListener("click",close);}

window.PK={user,isAccount,prompt,signOut,sync,syncSoon};
if(isAccount())(document.readyState==="loading"?document.addEventListener("DOMContentLoaded",sync):sync());
})();
