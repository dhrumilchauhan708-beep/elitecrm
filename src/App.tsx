import {useCallback,useEffect,useMemo,useState} from 'react';
import Papa from 'papaparse';
import {supabase,configured} from './supabase';
import {FIELDS,RATINGS,STATUSES,SERVICES,METHODS,autoMap,buildRows,existingFrom,safeCell,Built} from './importLogic';
import {LeadForm} from './LeadForm';

type Row=Record<string,any>;
type Say=(m:string,err?:boolean)=>void;

async function fetchAll(table:string,sel='*',q:(b:any)=>any=b=>b):Promise<Row[]>{
 const out:Row[]=[];
 for(let from=0;;from+=1000){
  const{data,error}=await q(supabase.from(table).select(sel)).order('created_at',{ascending:false}).order('id').range(from,from+999);
  if(error)throw error;
  out.push(...data);
  if(data.length<1000)break;
 }
 return out;
}

// 12-hour formatters with AM / PM
export const fmt=(d?:string|number|Date|null)=>{
 if(!d)return'—';
 const dt=new Date(d);
 if(isNaN(dt.getTime()))return'—';
 return dt.toLocaleString('en-US',{
  month:'short',
  day:'numeric',
  year:'numeric',
  hour:'numeric',
  minute:'2-digit',
  hour12:true
 });
};

export const fmtTime=(d?:string|number|Date|null)=>{
 if(!d)return'—';
 const dt=new Date(d);
 if(isNaN(dt.getTime()))return'—';
 return dt.toLocaleTimeString('en-US',{
  hour:'numeric',
  minute:'2-digit',
  hour12:true
 });
};

const sod=()=>{const d=new Date();d.setHours(0,0,0,0);return d;};
const eod=()=>{const d=sod();d.setDate(d.getDate()+1);return d;};
const bucket=(f:Row)=>{const t=new Date(f.due_at);return t<sod()?'overdue':t<eod()?'today':'upcoming';};

async function logAct(lead_id:string,type:string,summary:string,details?:string){
 return supabase.from('activities').insert({lead_id,type,summary,details:details||null});
}

const Tag=({r}:{r:string})=><span className={'tag '+r}>{r}</span>;

export default function App(){
 const[session,setSession]=useState<any>(undefined);
 useEffect(()=>{
  supabase.auth.getSession().then(({data})=>setSession(data.session));
  const{data}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
  return()=>data.subscription.unsubscribe();
 },[]);

 if(!configured)return(
  <div className="login-wrap">
   <div className="card login-card">
    <div className="login-brand-header">
     <img src="/elite-logo.png" alt="EliteInfotec" className="login-logo"/>
     <p className="login-subtitle">Setup required</p>
    </div>
    <p>Copy <code>.env.example</code> to <code>.env.local</code>, add your Supabase URL and anon key, then restart.</p>
   </div>
  </div>
 );

 if(session===undefined)return<p style={{padding:24}}>Loading…</p>;
 return session?<Shell/>:<Login/>;
}

function Login(){
 const[e,setE]=useState(''),[p,setP]=useState(''),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
 const go=async()=>{
  setBusy(true);setErr('');
  const{error}=await supabase.auth.signInWithPassword({email:e,password:p});
  if(error)setErr(error.message);
  setBusy(false);
 };

 return(
  <div className="login-wrap">
   <div className="card login-card">
    <div className="login-brand-header">
     <img src="/elite-logo.png" alt="EliteInfotec" className="login-logo"/>
     <p className="login-subtitle">Lead & Client Relationship Management</p>
    </div>
    <div className="row"><input placeholder="Email" value={e} onChange={x=>setE(x.target.value)}/></div>
    <div className="row"><input type="password" placeholder="Password" value={p} onChange={x=>setP(x.target.value)} onKeyDown={x=>x.key==='Enter'&&go()}/></div>
    {err&&<p className="over">{err}</p>}
    <button className="btn" style={{width:'100%',marginTop:4}} disabled={busy} onClick={go}>
     {busy?'Signing in…':'Sign in to CRM'}
    </button>
    <div className="login-footer-info">
     <a href="https://eliteinfotec.in" target="_blank" rel="noreferrer">eliteinfotec.in</a>
     <span>·</span>
     <span>Rajkot, India</span>
    </div>
   </div>
  </div>
 );
}

function Shell(){
 const[page,setPage]=useState('Dashboard'),[open,setOpen]=useState<string|null>(null),[leads,setLeads]=useState<Row[]>([]),[fups,setFups]=useState<Row[]>([]),
  [loading,setLoading]=useState(true),[toast,setToast]=useState<{m:string,err:boolean}|null>(null);

 const say:Say=(m,err=false)=>{setToast({m,err});setTimeout(()=>setToast(null),4000);};

 const reload=useCallback(async()=>{try{
  const[l,f]=await Promise.all([fetchAll('leads'),fetchAll('follow_ups','*, leads(company_name)',b=>b.is('completed_at',null))]);
  setLeads(l);setFups(f.sort((a,b)=>+new Date(a.due_at)-+new Date(b.due_at)));
 }catch(x:any){say('Could not load data: '+x.message,true);}setLoading(false);},[]);

 useEffect(()=>{reload();},[reload]);
 const due=fups.filter(f=>bucket(f)!=='upcoming').length,over=fups.filter(f=>bucket(f)==='overdue').length;
 useEffect(()=>{document.title=(due?`(${due}) `:'')+'EliteInfotec CRM';},[due]);

 const nav=(p:string)=>{setPage(p);setOpen(null);};
 const lead=open&&leads.find(l=>l.id===open);
 const props={leads,fups,reload,say,openLead:(id:string)=>setOpen(id)};

 return(
  <div className="app">
   <nav className="side">
    <div className="side-brand">
     <div className="side-brand-top">
      <img src="/favicon.jpg" alt="EliteInfotec Emblem" className="side-emblem"/>
      <img src="/elite-logo.png" alt="EliteInfotec" className="side-wordmark"/>
     </div>
     <span className="side-tagline">Sales & CRM</span>
    </div>
    <div className="side-nav">
     {['Dashboard','All Leads','Follow-ups','Calendar','Import Data','Company Details','Settings'].map(p=>
      <button key={p} className={page===p&&!open?'on':''} onClick={()=>nav(p)}>
       <span>{p}</span>
       {p==='Follow-ups'&&due>0&&<b className="tag" style={{color:'#ffb4a8',borderColor:'#ffb4a8'}}>{due}</b>}
      </button>)}
    </div>
    <div className="side-footer">
     <div>EliteInfotec Technologies</div>
     <a href="https://eliteinfotec.in" target="_blank" rel="noreferrer">eliteinfotec.in ↗</a>
    </div>
   </nav>
   <main className="main">
    {due>0&&<div className={'banner'+(over?' bad':'')}><span><b>{over?`${over} overdue`:''}{over&&due-over?' · ':''}{due-over?`${due-over} due today`:''}</b> — in-app reminders; 12-hour format active.</span><button className="btn" onClick={()=>nav('Follow-ups')}>View follow-ups</button></div>}
    {loading?<p>Loading…</p>:lead?<LeadDetail key={lead.id} lead={lead} {...props} back={()=>setOpen(null)}/>:
     page==='Dashboard'?<Dashboard {...props}/>:page==='All Leads'?<Leads {...props}/>:page==='Follow-ups'?<FollowUps {...props}/>:
     page==='Calendar'?<Calendar {...props}/>:page==='Import Data'?<Import {...props}/>:page==='Company Details'?<CompanyDetails/>:<Settings/>}
   </main>
   {toast&&<div className={'toast'+(toast.err?' err':'')}>{toast.m}</div>}
  </div>
 );
}

type P={leads:Row[],fups:Row[],reload:()=>Promise<void>,say:Say,openLead:(id:string)=>void};

function Dashboard({leads,fups,openLead}:P){
 const c=(f:(l:Row)=>boolean)=>leads.filter(f).length;
 const recent=[...leads].filter(l=>l.last_contact_at).sort((a,b)=>+new Date(b.last_contact_at)-+new Date(a.last_contact_at)).slice(0,6);
 const b=(k:string)=>fups.filter(f=>bucket(f)===k).length;
 const S=({n,l}:{n:number,l:string})=><div className="stat"><b>{n}</b><span>{l}</span></div>;

 return<>
  <h2>Dashboard</h2>
  <div className="grid"><S n={leads.length} l="Total leads"/><S n={c(l=>l.rating==='Hot')} l="Hot"/><S n={c(l=>l.rating==='Warm')} l="Warm"/><S n={c(l=>l.rating==='Cold')} l="Cold"/></div>
  <div className="grid"><S n={b('overdue')} l="Overdue follow-ups"/><S n={b('today')} l="Due today"/><S n={b('upcoming')} l="Upcoming"/><S n={c(l=>l.status==='Won')} l="Won"/><S n={c(l=>l.status==='Lost')} l="Lost"/></div>
  <div className="card">
   <h3 style={{marginTop:0}}>Recently Contacted</h3>
   {recent.length?recent.map(l=><div key={l.id} className="row" style={{marginBottom:6}}>
    <a href="#" onClick={e=>{e.preventDefault();openLead(l.id)}} style={{fontWeight:600}}>{l.company_name}</a>
    <span className="mut">{fmt(l.last_contact_at)}</span>
   </div>):<p className="mut">No contact logged yet. Open a lead and log a contact to see it here.</p>}
  </div>
 </>;
}

const empty:Row={company_name:'',rating:'Cold',status:'New',source:'LinkedIn'};

function Leads({leads,reload,say,openLead}:P){
 const[q,setQ]=useState(''),[rt,setRt]=useState(''),[st,setSt]=useState(''),[sv,setSv]=useState(''),[adding,setAdding]=useState(false),[page,setPage]=useState(0);
 const list=useMemo(()=>{const t=q.toLowerCase();return leads.filter(l=>(!rt||l.rating===rt)&&(!st||l.status===st)&&(!sv||l.service_interest===sv)&&
  (!t||['company_name','contact_person','email','phone','country','industry','job_title','source'].some(k=>(l[k]||'').toLowerCase().includes(t))));},[leads,q,rt,st,sv]);
 useEffect(()=>setPage(0),[q,rt,st,sv]);

 const create=async(v:Row)=>{
  const rec=Object.fromEntries(Object.entries(v).filter(([,x])=>x!==''));
  if(!rec.company_name)return say('Company name is required',true);
  const{data,error}=await supabase.from('leads').insert(rec).select('id').single();
  if(error)return say(error.message,true);
  await logAct(data.id,'Note','Lead added manually');
  setAdding(false);await reload();say('Lead added');
 };

 const exportCsv=()=>{
  const rows=list.map(l=>Object.fromEntries([...FIELDS.map(f=>[f.label,safeCell(l[f.key]??'')]),['Last contact',fmt(l.last_contact_at)]]));
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([Papa.unparse(rows)],{type:'text/csv'}));a.download='leads.csv';a.click();
 };

 const per=50,shown=list.slice(page*per,page*per+per);
 const opt=(l:string[],a:string)=><><option value="">{a}</option>{l.map(x=><option key={x}>{x}</option>)}</>;

 return<>
  <h2>All Leads <span className="mut" style={{fontSize:14,fontWeight:400}}>({list.length} of {leads.length})</span></h2>
  <div className="row">
   <input placeholder="Search company, contact, email, phone…" value={q} onChange={e=>setQ(e.target.value)}/>
   <select value={rt} onChange={e=>setRt(e.target.value)}>{opt(RATINGS,'All ratings')}</select>
   <select value={st} onChange={e=>setSt(e.target.value)}>{opt(STATUSES,'All statuses')}</select>
   <select value={sv} onChange={e=>setSv(e.target.value)}>{opt(SERVICES,'All services')}</select>
   <button className="btn" onClick={()=>setAdding(true)}>Add lead</button>
   <button className="btn sec" disabled={!list.length} onClick={exportCsv}>Export CSV</button>
  </div>
  {adding&&<LeadForm init={empty} onSave={create} onCancel={()=>setAdding(false)}/>}
  <div className="tw">
   <table>
    <thead><tr><th>Company</th><th>Contact</th><th>Rating</th><th>Status</th><th>Service</th><th>Last contact (12h)</th></tr></thead>
    <tbody>
     {shown.map(l=><tr key={l.id} className="click" onClick={()=>openLead(l.id)}>
      <td><b>{l.company_name}</b></td>
      <td>{l.contact_person||'—'}</td>
      <td><Tag r={l.rating}/></td>
      <td>{l.status}</td>
      <td>{l.service_interest||'—'}</td>
      <td>{fmt(l.last_contact_at)}</td>
     </tr>)}
     {!shown.length&&<tr><td colSpan={6} className="mut">{leads.length?'No leads match these filters.':'No leads yet. Add one, or use Import Data to upload a CSV.'}</td></tr>}
    </tbody>
   </table>
  </div>
  {list.length>per&&<div className="row" style={{marginTop:12}}>
   <button className="btn sec" disabled={!page} onClick={()=>setPage(page-1)}>Previous</button>
   <span className="mut">Page {page+1} of {Math.ceil(list.length/per)}</span>
   <button className="btn sec" disabled={(page+1)*per>=list.length} onClick={()=>setPage(page+1)}>Next</button>
  </div>}
 </>;
}

function Schedule({lead,say,done,label='Schedule follow-up'}:{lead:Row,say:Say,done:()=>void,label?:string}){
 const[due,setDue]=useState(''),[m,setM]=useState('Email'),[a,setA]=useState(''),[n,setN]=useState('');
 const save=async()=>{
  if(!due)return say('Choose a date and time',true);
  const iso=new Date(due).toISOString();
  const{error}=await supabase.from('follow_ups').insert({lead_id:lead.id,due_at:iso,method:m,next_action:a||null,notes:n||null});
  if(error)return say(error.message,true);
  await logAct(lead.id,'Follow-up scheduled',`${m} on ${fmt(iso)}`,[a,n].filter(Boolean).join(' — '));
  setDue('');setA('');setN('');say('Follow-up saved');done();
 };

 return<div>
  <div className="row">
   <input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/>
   <select value={m} onChange={e=>setM(e.target.value)}>{METHODS.map(x=><option key={x}>{x}</option>)}</select>
  </div>
  {due&&<div className="hint-12h">⏰ Follow-up time (12h): <b>{fmt(due)}</b></div>}
  <div className="row">
   <input placeholder="Next action (e.g. Send proposal)" value={a} onChange={e=>setA(e.target.value)}/>
   <input placeholder="Notes" value={n} onChange={e=>setN(e.target.value)}/>
   <button className="btn" onClick={save}>{label}</button>
  </div>
 </div>;
}

function Complete({f,say,done}:{f:Row,say:Say,done:()=>void}){
 const[open,setOpen]=useState(false),[out,setOut]=useState('');
 const go=async()=>{
  const nowIso=new Date().toISOString();
  const{error}=await supabase.from('follow_ups').update({completed_at:nowIso}).eq('id',f.id);
  if(error)return say(error.message,true);
  await supabase.from('leads').update({last_contact_at:nowIso}).eq('id',f.lead_id);
  await logAct(f.lead_id,'Follow-up completed',`${f.method}: ${f.next_action||'follow-up'}`,out);
  say('Follow-up marked complete');setOpen(false);done();
 };
 return open?<span className="row" style={{marginBottom:0}}><input placeholder="Outcome (optional)" value={out} onChange={e=>setOut(e.target.value)}/><button className="btn" onClick={go}>Confirm complete</button></span>:<button className="btn" onClick={()=>setOpen(true)}>Mark complete</button>;
}

function FollowUps({fups,reload,say,openLead}:P){
 const[next,setNext]=useState<Row|null>(null);
 const grp=(k:string,t:string)=>{
  const l=fups.filter(f=>bucket(f)===k);
  return<>
   <h3 className={k==='overdue'?'over':''}>{t} ({l.length})</h3>
   {l.map(f=><div className="card" key={f.id}>
    <div className="row" style={{marginBottom:6}}>
     <a href="#" onClick={e=>{e.preventDefault();openLead(f.lead_id)}}><b>{f.leads?.company_name}</b></a>
     <span className={k==='overdue'?'over':''} style={{fontWeight:500}}>
      {fmt(f.due_at)} · {f.method}
     </span>
    </div>
    <div className="mut">{f.next_action||'No next action set'}{f.notes&&` — ${f.notes}`}</div>
    <div className="row" style={{marginTop:10,marginBottom:0}}>
     <Complete f={f} say={say} done={async()=>{await reload();}}/>
     <button className="btn sec" onClick={()=>setNext(f)}>Set next follow-up</button>
    </div>
    {next?.id===f.id&&<div style={{marginTop:10}}>
     <Schedule lead={{id:f.lead_id}} say={say} label="Save next follow-up" done={async()=>{setNext(null);await reload();}}/>
    </div>}
   </div>)}
   {!l.length&&<p className="mut">Nothing here.</p>}
  </>;
 };

 return<><h2>Follow-ups</h2>{grp('overdue','Overdue')}{grp('today','Due today')}{grp('upcoming','Upcoming')}</>;
}

function Calendar({fups,openLead}:P){
 const days=new Map<string,Row[]>();
 fups.forEach(f=>{
  const k=new Date(f.due_at).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
  days.set(k,[...(days.get(k)||[]),f]);
 });

 return<>
  <h2>Calendar</h2>
  <p className="mut">Pending follow-ups organized by day (all times in 12-hour AM/PM format).</p>
  {[...days].map(([d,l])=><div className="card" key={d}>
   <b style={{color:'var(--side)'}}>{d}</b>
   {l.map(f=><div key={f.id} className="row" style={{margin:'8px 0 0',alignItems:'center'}}>
    <span style={{fontWeight:600,color:'var(--acc)',minWidth:90}}>
     {fmtTime(f.due_at)}
    </span>
    <span style={{color:'var(--mut)'}}>· {f.method}</span>
    <a href="#" onClick={e=>{e.preventDefault();openLead(f.lead_id)}} style={{fontWeight:600}}>{f.leads?.company_name}</a>
    <span className="mut">{f.next_action}</span>
   </div>)}
  </div>)}
  {!days.size&&<p className="mut">No pending follow-ups scheduled.</p>}
 </>;
}

function LeadDetail({lead,reload,say,back,fups}:P&{lead:Row,back:()=>void}){
 const[acts,setActs]=useState<Row[]>([]),[edit,setEdit]=useState(false),[type,setType]=useState('Note'),[sum,setSum]=useState('');
 const mine=fups.filter(f=>f.lead_id===lead.id);

 const loadActs=useCallback(async()=>{
  const{data,error}=await supabase.from('activities').select('*').eq('lead_id',lead.id).order('occurred_at',{ascending:false});
  if(error)say(error.message,true);else setActs(data);
 },[lead.id]);

 useEffect(()=>{loadActs();},[loadActs]);
 const refresh=async()=>{await reload();await loadActs();};

 const save=async(v:Row)=>{
  if(!v.company_name?.trim())return say('Company name is required',true);
  const rec:Row={};FIELDS.forEach(f=>rec[f.key]=v[f.key]===''?null:v[f.key]??null);
  const{error}=await supabase.from('leads').update(rec).eq('id',lead.id);if(error)return say(error.message,true);
  if(rec.status!==lead.status)await logAct(lead.id,'Status change',`${lead.status} → ${rec.status}`);
  if(rec.rating!==lead.rating)await logAct(lead.id,'Rating change',`${lead.rating} → ${rec.rating}`);
  setEdit(false);await refresh();say('Lead saved');
 };

 const addAct=async()=>{
  if(!sum.trim())return say('Write a short summary',true);
  const{error}=await logAct(lead.id,type,sum.trim());if(error)return say(error.message,true);
  if(type!=='Note')await supabase.from('leads').update({last_contact_at:new Date().toISOString()}).eq('id',lead.id);
  setSum('');await refresh();say('Activity logged');
 };

 const convert=async()=>{
  if(!confirm('Mark as Won and convert to a client? Notes and history are kept.'))return;
  const{error}=await supabase.rpc('convert_lead_to_client',{p_lead_id:lead.id});
  if(error)return say(error.message,true);
  await refresh();say('Converted to client');
 };

 const remove=async()=>{
  if(!confirm('Delete this lead and its history permanently?'))return;
  const{error}=await supabase.from('leads').delete().eq('id',lead.id);if(error)return say(error.message,true);
  await reload();back();say('Lead deleted');
 };

 return<>
  <button className="btn sec" onClick={back}>← Back to leads</button>
  <h2 style={{marginTop:14}}>{lead.company_name} <Tag r={lead.rating}/> <span className="mut" style={{fontSize:14,fontWeight:400}}>{lead.status}</span></h2>
  {edit?<LeadForm init={lead} onSave={save} onCancel={()=>setEdit(false)}/>:
   <div className="card">
    <div className="form">
     {FIELDS.filter(f=>!['rating','status','notes','promising_reason'].includes(f.key)&&f.key!=='company_name').map(f=>
      <div key={f.key}><label>{f.label}</label><div>{lead[f.key]||'—'}</div></div>)}
     <div className="wide"><label>Why promising</label><div>{lead.promising_reason||'—'}</div></div>
     <div className="wide"><label>Notes</label><div style={{whiteSpace:'pre-wrap'}}>{lead.notes||'—'}</div></div>
    </div>
    <div className="row" style={{marginTop:16}}>
     <button className="btn" onClick={()=>setEdit(true)}>Edit</button>
     {lead.status!=='Won'&&<button className="btn" onClick={convert}>Mark Won & convert to client</button>}
     <button className="btn bad" onClick={remove}>Delete</button>
    </div>
   </div>}

  <div className="card">
   <h3 style={{marginTop:0}}>Follow-up Reminders</h3>
   {mine.map(f=><div key={f.id} className="row">
    <span className={bucket(f)==='overdue'?'over':''} style={{fontWeight:500}}>{fmt(f.due_at)} · {f.method} · {f.next_action||'—'}</span>
    <Complete f={f} say={say} done={refresh}/>
   </div>)}
   <Schedule lead={lead} say={say} done={refresh}/>
   <p className="mut" style={{marginTop:12}}>Last contact: <b>{fmt(lead.last_contact_at)}</b></p>
  </div>

  <div className="card">
   <h3 style={{marginTop:0}}>Activity History</h3>
   <div className="row">
    <select value={type} onChange={e=>setType(e.target.value)}>{['Note',...METHODS].map(x=><option key={x}>{x}</option>)}</select>
    <input placeholder="What happened? (non-note types update last contact)" value={sum} onChange={e=>setSum(e.target.value)}/>
    <button className="btn" onClick={addAct}>Log activity</button>
   </div>
   <div className="tl">
    {acts.map(a=><div key={a.id}>
     <b>{a.type}</b> — {a.summary}
     {a.details&&<div className="mut">{a.details}</div>}
     <br/><small>{fmt(a.occurred_at)}</small>
    </div>)}
    {!acts.length&&<p className="mut">No activity logged yet.</p>}
   </div>
  </div>
 </>;
}

function Import({leads,reload,say}:P){
 const[file,setFile]=useState(''),[rows,setRows]=useState<Row[]>([]),[map,setMap]=useState<Record<string,string>>({}),[dupes,setDupes]=useState(false),[busy,setBusy]=useState(false);
 const headers=Object.keys(map);
 const built=useMemo<Built[]>(()=>rows.length?buildRows(rows,map,existingFrom(leads)):[],[rows,map,leads]);
 const good=built.filter(b=>!b.errors.length&&(dupes||!b.duplicateOf)),bad=built.filter(b=>b.errors.length),dup=built.filter(b=>!b.errors.length&&b.duplicateOf);

 const onFile=(f?:File)=>{
  if(!f)return;setFile(f.name);
  if(/\.xlsx?$/i.test(f.name))return say('Excel files are not supported yet. In Excel use File → Save As → CSV, then upload that.',true);
  Papa.parse<Row>(f,{header:true,skipEmptyLines:true,complete:r=>{
   if(!r.meta.fields?.length)return say('No header row found',true);
   setRows(r.data);setMap(autoMap(r.meta.fields));
  },error:e=>say(e.message,true)});
 };

 const template=()=>{
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([Papa.unparse({
   fields:FIELDS.map(f=>f.label),
   data:[['Example Co','Jane Doe','CEO','jane@example.com','+91 90000 00000','https://example.com','https://linkedin.com/in/jane','India','Retail','LinkedIn','Warm','New','WordPress','Needs a new site','Met at expo']]
  })],{type:'text/csv'}));
  a.download='leads-template.csv';a.click();
 };

 const run=async()=>{
  if(!map||!Object.values(map).includes('company_name'))return say('Map a column to Company name first',true);
  setBusy(true);let n=0;
  try{
   for(let i=0;i<good.length;i+=500){
    const chunk=good.slice(i,i+500).map(b=>b.record);
    const{data,error}=await supabase.from('leads').insert(chunk).select('id');
    if(error)throw new Error(`${error.message} (${n} imported before this error)`);
    n+=data.length;
    await supabase.from('activities').insert(data.map(d=>({lead_id:d.id,type:'Imported',summary:'Imported from '+file})));
   }
   say(`Imported ${n} leads`);setRows([]);setMap({});setFile('');await reload();
  }catch(e:any){say(e.message,true);await reload();}
  setBusy(false);
 };

 return<>
  <h2>Import Data</h2>
  <div className="card">
   <p>Upload a CSV with a header row. You can map columns before anything is saved into Supabase.</p>
   <div className="row">
    <input type="file" accept=".csv,text/csv" onChange={e=>onFile(e.target.files?.[0])}/>
    <button className="btn sec" onClick={template}>Download sample CSV</button>
   </div>
  </div>
  {rows.length>0&&<>
   <div className="card">
    <h3 style={{marginTop:0}}>Map columns</h3>
    <div className="form">
     {headers.map(h=><div key={h}>
      <label>{h}</label>
      <select value={map[h]} onChange={e=>setMap({...map,[h]:e.target.value})}>
       <option value="">Don't import</option>
       {FIELDS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
     </div>)}
    </div>
   </div>
   <div className="grid">
    <div className="stat"><b>{good.length}</b><span>Ready to import</span></div>
    <div className="stat"><b>{dup.length}</b><span>Likely duplicates{dupes?' (included)':' (skipped)'}</span></div>
    <div className="stat"><b>{bad.length}</b><span>Rows with errors (skipped)</span></div>
   </div>
   <label><input type="checkbox" style={{width:'auto'}} checked={dupes} onChange={e=>setDupes(e.target.checked)}/> Import likely duplicates anyway</label>
   <div className="tw card" style={{marginTop:12}}>
    <table>
     <thead><tr><th>Row</th><th>Company</th><th>Email</th><th>Result</th></tr></thead>
     <tbody>
      {built.slice(0,100).map(b=><tr key={b.line}>
       <td>{b.line}</td><td>{b.record.company_name||'—'}</td><td>{b.record.email||'—'}</td>
       <td className={b.errors.length?'over':''}>{b.errors[0]||(b.duplicateOf?'Possible duplicate: '+b.duplicateOf:'OK')}{b.warnings.length>0&&' · '+b.warnings.join('; ')}</td>
      </tr>)}
     </tbody>
    </table>
    {built.length>100&&<p className="mut">Showing first 100 of {built.length} rows.</p>}
   </div>
   <button className="btn" disabled={busy||!good.length} onClick={run}>
    {busy?'Importing…':`Import ${good.length} leads`}
   </button>
  </>}
 </>;
}

function CompanyDetails(){
 const services=[
  'IT Business Solutions','UI/UX Design','Mobile App Development','Web App Development',
  'E-Commerce Integration','QA Testing & Automation','AI Automation'
 ];
 const technologies=[
  'PHP','Laravel','CodeIgniter','ReactJS','Node.js','Angular','VueJs','TypeScript',
  'WordPress','Shopify','Wix','Squarespace','Flutter','React Native','iOS / Xcode','Android'
 ];

 return<>
  <h2>Company Details</h2>
  <div className="company-hero">
   <img src="/elite-logo.png" alt="EliteInfotec" className="company-hero-logo"/>
   <p>Top-rated IT & Web Development Company in India. Trusted by global clients for custom web apps, mobile apps, UI/UX design & scalable digital solutions.</p>
   <a href="https://eliteinfotec.in" target="_blank" rel="noreferrer" className="btn" style={{background:'#ffffff',color:'#05373e',fontWeight:700}}>
    Visit Official Website ↗
   </a>
  </div>

  <div className="company-contact-grid">
   <div className="company-contact-box">
    <h4>Official Website</h4>
    <div><a href="https://eliteinfotec.in" target="_blank" rel="noreferrer">eliteinfotec.in</a></div>
   </div>
   <div className="company-contact-box">
    <h4>Email Address</h4>
    <div><a href="mailto:info@eliteinfotec.in">info@eliteinfotec.in</a></div>
   </div>
   <div className="company-contact-box">
    <h4>Phone / WhatsApp</h4>
    <div><a href="tel:+918128234673">+91 812 823 4673</a></div>
   </div>
   <div className="company-contact-box">
    <h4>Office Location</h4>
    <div style={{fontSize:13.5,lineHeight:1.4}}>
     "RK Iconic" A-wing 10th floor, Office No. 1004, Near Shital Park BRTS Bus Stop, 150ft Ring Road, Rajkot 360005, Gujarat, India
    </div>
   </div>
  </div>

  <div className="card">
   <h3 style={{marginTop:0}}>Solutions & Services</h3>
   <div>
    {services.map(s=><span key={s} className="service-pill">{s}</span>)}
   </div>
   <h3 style={{marginTop:16}}>Core Technologies</h3>
   <div>
    {technologies.map(t=><span key={t} className="service-pill">{t}</span>)}
   </div>
  </div>

  <div className="card">
   <h3 style={{marginTop:0}}>Official Social Profiles</h3>
   <div className="row" style={{marginBottom:0}}>
    <a href="https://in.linkedin.com/company/eliteinfotec" target="_blank" rel="noreferrer" className="btn sec">
     LinkedIn Company Page ↗
    </a>
    <a href="https://www.instagram.com/elite_infotec/" target="_blank" rel="noreferrer" className="btn sec">
     Instagram ↗
    </a>
    <a href="https://www.facebook.com/EliteInfotectechnologies" target="_blank" rel="noreferrer" className="btn sec">
     Facebook ↗
    </a>
   </div>
  </div>
 </>;
}

function Settings(){
 return<>
  <h2>Settings</h2>
  <div className="card">
   <h3 style={{marginTop:0}}>System & Database</h3>
   <p>Your data is securely stored in your dedicated Supabase project and protected by strict Row-Level Security (RLS).</p>
   <p className="mut">Date format configured: <b>12-Hour format with AM / PM</b>.</p>
   <button className="btn sec" onClick={()=>supabase.auth.signOut()}>Sign out</button>
  </div>
 </>;
}
