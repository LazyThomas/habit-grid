/* Habit Grid Google Drive sync — browser OAuth, no client secret. */
(()=>{"use strict";
const CLIENT_ID=window.HABIT_GRID_GOOGLE_CLIENT_ID||"";
const BASE="https://www.googleapis.com/drive/v3";
const KEY="habitgrid.sync.v1", LOCAL="habitgrid.v1";
const status=document.getElementById("status");
const bar=document.createElement("div");bar.style.cssText="display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;margin:0 0 12px";
bar.innerHTML='<button id="google-connect" class="action" type="button">Connect Google Drive</button><button id="google-disconnect" class="secondary" type="button" hidden>Disconnect</button><span id="google-state" style="font-size:12px;color:#52677b">Local only</span>';
status.before(bar);
const login=document.getElementById("google-connect"),logout=document.getElementById("google-disconnect"),state=document.getElementById("google-state");
let token="",tokenExpiry=0,client=null,busy=false,queued=false,folderId="",fileId="";
const deviceKey="habitgrid.device.v1";let device=localStorage.getItem(deviceKey);if(!device){device=crypto.randomUUID();localStorage.setItem(deviceKey,device)}
let syncState;try{syncState=JSON.parse(localStorage.getItem(KEY))||{habits:{},checks:{}}}catch{syncState={habits:{},checks:{}}}
syncState.habits ||= {};syncState.checks ||= {};
const record=(v,t=1,d=device)=>({v,t,d});
function read(){try{return JSON.parse(localStorage.getItem(LOCAL))||{habits:[],checks:{}}}catch{return{habits:[],checks:{}}}}
function initialize(){const x=read();for(const h of x.habits||[])syncState.habits[h.id] ||=record(h.name);for(const [k,v] of Object.entries(x.checks||{}))syncState.checks[k] ||=record(!!v)}
initialize();
function persist(){localStorage.setItem(KEY,JSON.stringify(syncState))}
persist();
function reflect(){const habits=Object.entries(syncState.habits).filter(([,r])=>r.v!==null).sort(([a,ra],[b,rb])=>a.localeCompare(b)).map(([id,r])=>({id,name:r.v}));const checks={};for(const [k,r] of Object.entries(syncState.checks))if(r.v===true)checks[k]=true;window.HabitGridApply?.({habits,checks})}
function stamp(){return Date.now()}
function updateFromLocal(){const x=read();const current=new Map((x.habits||[]).map(h=>[h.id,h.name]));for(const [id,name] of current){if(syncState.habits[id]?.v!==name)syncState.habits[id]=record(name,stamp())}for(const [id,r] of Object.entries(syncState.habits))if(r.v!==null&&!current.has(id))syncState.habits[id]=record(null,stamp());const keys=new Set([...Object.keys(syncState.checks),...Object.keys(x.checks||{})]);for(const k of keys){const value=!!x.checks[k];if(syncState.checks[k]?.v!==value)syncState.checks[k]=record(value,stamp())}persist()}
window.addEventListener("habitgrid:change",()=>{updateFromLocal();schedule()});
function combine(remote){for(const type of ["habits","checks"]){for(const [k,r] of Object.entries(remote?.[type]||{})){if(!r||typeof r.t!=="number")continue;const old=syncState[type][k];if(!old||r.t>old.t||(r.t===old.t&&String(r.d)>String(old.d)))syncState[type][k]=r}}}
async function api(url,options={}){const response=await fetch(url,{...options,headers:{Authorization:"Bearer "+token,...(options.headers||{})}});if(response.status===401){token="";show("Session expired. Connect again.");throw Error("Google sign-in expired")}if(!response.ok)throw Error("Google Drive "+response.status+": "+(await response.text()).slice(0,180));if(response.status===204)return null;return response.json()}
const quoted=s=>s.replace(/'/g,"\\'");
async function find(name,mime,parent){let q="name = '"+quoted(name)+"' and trashed = false";if(mime)q+=" and mimeType = '"+mime+"'";if(parent)q+=" and '"+parent+"' in parents";const res=await api(BASE+"/files?fields=nextPageToken,files(id,name,mimeType)&page_size=100&q="+encodeURIComponent(q));return res.files?.[0]||null}
async function create(meta){return api(BASE+"/files?fields=id,name",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(meta)})}
async function ensureFolder(){if(folderId)return;const found=await find("Habit Grid","application/vnd.google-apps.folder");folderId=found?.id||(await create({name:"Habit Grid",mimeType:"application/vnd.google-apps.folder"})).id}
async function ensureFile(){if(fileId)return;const name="habit-grid-"+device+".json";const found=await find(name,"application/json",folderId);fileId=found?.id||(await create({name,mimeType:"application/json",parents:[folderId]})).id}
async function listFiles(){let page="",files=[];do{const u=BASE+"/files?fields=nextPageToken,files(id,name,mimeType)&page_size=1000&q="+encodeURIComponent("'"+folderId+"' in parents and trashed = false");const r=await api(u+(page?"&pageToken="+encodeURIComponent(page):""));files.push(...(r.files||[]));page=r.nextPageToken||""}while(page);return files.filter(f=>/^habit-grid-[a-f0-9-]+\.json$/.test(f.name))}
async function pull(){for(const f of await listFiles()){try{const r=await api(BASE+"/files/"+encodeURIComponent(f.id)+"?alt=media");combine(r)}catch(e){console.warn("Unable to read sync file",f.name,e)}}persist();reflect()}
async function push(){await ensureFile();const endpoint="https://www.googleapis.com/upload/drive/v3/files/"+encodeURIComponent(fileId)+"?uploadType=media";await api(endpoint,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...syncState,format:1,device})})}
function show(msg){state.textContent=msg;login.hidden=!!token;logout.hidden=!token}
async function synchronize(){if(!token||Date.now()>tokenExpiry){if(token){token="";show("Sign in again to sync")}return}if(busy){queued=true;return}if(!navigator.onLine){show("Offline — saved locally");return}busy=true;show("Synchronizing…");try{await ensureFolder();await pull();await push();show("Google Drive synced ✓")}catch(e){console.error(e);show("Sync error — "+e.message)}finally{busy=false;if(queued){queued=false;schedule()}}}
let pending;function schedule(){if(!token)return;clearTimeout(pending);pending=setTimeout(synchronize,900)}
function connect(){if(!CLIENT_ID){show("Google OAuth client ID required — see SETUP.md");return}if(!window.google?.accounts?.oauth2){show("Google sign-in unavailable; check connection");return}client ||= google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:"https://www.googleapis.com/auth/drive.file",callback:r=>{if(r.error){show("Sign-in failed: "+r.error);return}token=r.access_token;tokenExpiry=Date.now()+(r.expires_in-60)*1000;folderId="";fileId="";show("Connected");schedule()}});client.requestAccessToken({prompt:""})}
login.onclick=connect;logout.onclick=()=>{if(token&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(token,()=>{});token="";fileId="";folderId="";show("Disconnected — data remains local")};
window.addEventListener("online",schedule);document.addEventListener("visibilitychange",()=>{if(!document.hidden)schedule()});setInterval(()=>{if(!document.hidden)schedule()},60000);
if(!CLIENT_ID)show("Local only — configure Google OAuth to enable sync");
})();