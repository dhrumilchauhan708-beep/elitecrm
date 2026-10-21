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

const Tag=({r}:{r:string})=>{
 const icon = r==='Hot'?'fa-solid fa-fire':r==='Warm'?'fa-solid fa-sun':'fa-solid fa-snowflake';
 return <span className={'tag '+r}><i className={icon}></i> {r}</span>;
};

const StatusPill=({s}:{s:string})=>{
 let icon = 'fa-solid fa-circle-dot';
 let clr = 'status-default';
 if(s==='Won'){ icon = 'fa-solid fa-trophy'; clr = 'status-won'; }
 else if(s==='Lost'||s==='Not Interested'){ icon = 'fa-solid fa-circle-xmark'; clr = 'status-lost'; }
 else if(s==='Interested'||s==='Proposal Sent'){ icon = 'fa-solid fa-paper-plane'; clr = 'status-active'; }
 else if(s==='Contacted'||s==='Follow-up'){ icon = 'fa-solid fa-clock-rotate-left'; clr = 'status-progress'; }
 else if(s==='New'){ icon = 'fa-solid fa-sparkles'; clr = 'status-new'; }
 return <span className={`status-pill ${clr}`}><i className={icon}></i> {s}</span>;
};

const MethodIcon=({m}:{m:string})=>{
 if(m==='WhatsApp') return <i className="fa-brands fa-whatsapp text-emerald"></i>;
 if(m==='Email') return <i className="fa-solid fa-envelope text-blue"></i>;
 if(m==='Phone') return <i className="fa-solid fa-phone text-purple"></i>;
 if(m==='LinkedIn') return <i className="fa-brands fa-linkedin text-cyan"></i>;
 return <i className="fa-solid fa-comment-dots"></i>;
};

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
     <div className="login-badge"><i className="fa-solid fa-gear"></i> Setup Required</div>
    </div>
    <p>Copy <code>.env.example</code> to <code>.env.local</code>, add your Supabase URL and anon key, then restart.</p>
   </div>
  </div>
 );

 if(session===undefined)return<div className="app-loading"><i className="fa-solid fa-circle-notch fa-spin"></i> Initializing Elite CRM…</div>;
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
     <div className="login-badge"><i className="fa-solid fa-shield-halved"></i> Internal Access Portal</div>
     <p className="login-subtitle">Lead & Client Relationship Management</p>
    </div>

    <div className="login-input-group">
     <div className="input-with-icon">
      <i className="fa-solid fa-envelope input-icon"></i>
      <input
       placeholder="Enter authorized email"
       value={e}
       onChange={x=>setE(x.target.value)}
      />
     </div>
     <div className="input-with-icon">
      <i className="fa-solid fa-lock input-icon"></i>
      <input
       type="password"
       placeholder="Enter password"
       value={p}
       onChange={x=>setP(x.target.value)}
       onKeyDown={x=>x.key==='Enter'&&go()}
      />
     </div>
    </div>

    {err&&<div className="error-alert"><i className="fa-solid fa-circle-exclamation"></i> {err}</div>}

    <button className="btn btn-primary" style={{width:'100%',marginTop:10}} disabled={busy} onClick={go}>
     {busy?<><i className="fa-solid fa-spinner fa-spin"></i> Authenticating…</>:<><i className="fa-solid fa-right-to-bracket"></i> Sign in to CRM</>}
    </button>

    <div className="login-footer-info">
     <a href="https://eliteinfotec.in" target="_blank" rel="noreferrer">
      <i className="fa-solid fa-globe"></i> eliteinfotec.in
     </a>
     <span>·</span>
     <span><i className="fa-solid fa-location-dot"></i> Rajkot, India</span>
    </div>
   </div>
  </div>
 );
}

function Shell(){
 const[page,setPage]=useState('Dashboard'),[open,setOpen]=useState<string|null>(null),[leads,setLeads]=useState<Row[]>([]),[fups,setFups]=useState<Row[]>([]),
  [loading,setLoading]=useState(true),[toast,setToast]=useState<{m:string,err:boolean}|null>(null),
  [quickAdd,setQuickAdd]=useState(false);

 const[liveClock,setLiveClock]=useState('');
 useEffect(()=>{
  const tick=()=>{
   setLiveClock(new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true}));
  };
  tick();
  const id=setInterval(tick,1000);
  return()=>clearInterval(id);
 },[]);

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

 const navItems = [
  { name: 'Dashboard', icon: 'fa-solid fa-gauge-high' },
  { name: 'All Leads', icon: 'fa-solid fa-address-book' },
  { name: 'Follow-ups', icon: 'fa-solid fa-clock-rotate-left', count: due },
  { name: 'Calendar', icon: 'fa-solid fa-calendar-days' },
  { name: 'Import Data', icon: 'fa-solid fa-file-arrow-up' },
  { name: 'Company Details', icon: 'fa-solid fa-building' },
  { name: 'Settings', icon: 'fa-solid fa-sliders' }
 ];

 return(
  <div className="app">
   <nav className="side">
    <div className="side-brand">
     <div className="side-brand-top">
      <img src="/favicon.jpg" alt="EliteInfotec Emblem" className="side-emblem"/>
      <img src="/elite-logo.png" alt="EliteInfotec" className="side-wordmark"/>
     </div>
     <div className="side-tagline-wrap">
      <span className="side-tagline">SALES & CRM</span>
      <span className="side-badge">v1.2</span>
     </div>
    </div>

    <div className="side-nav">
     {navItems.map(item=>
      <button key={item.name} className={page===item.name&&!open?'on':''} onClick={()=>nav(item.name)}>
       <span className="nav-item-left">
        <i className={item.icon}></i>
        <span>{item.name}</span>
       </span>
       {Boolean(item.count && item.count > 0) && (
        <span className="nav-counter-badge">{item.count}</span>
       )}
      </button>)}
    </div>

    <div className="side-footer">
     <div className="side-user-card">
      <div className="side-user-avatar"><i className="fa-solid fa-user-tie"></i></div>
      <div className="side-user-meta">
       <div className="side-user-name">EliteInfotec Admin</div>
       <div className="side-user-status"><i className="fa-solid fa-circle text-emerald"></i> Online</div>
      </div>
      <button className="side-signout-btn" title="Sign Out" onClick={()=>supabase.auth.signOut()}>
       <i className="fa-solid fa-arrow-right-from-bracket"></i>
      </button>
     </div>
     <a href="https://eliteinfotec.in" target="_blank" rel="noreferrer" className="side-company-link">
      <span>eliteinfotec.in</span> <i className="fa-solid fa-arrow-up-right-from-square"></i>
     </a>
    </div>
   </nav>

   <main className="main">
    {/* Sleek Topbar */}
    <header className="topbar">
     <div className="topbar-left">
      <div className="topbar-breadcrumb">
       <span className="crumb-brand">EliteInfotec</span>
       <span className="crumb-sep"><i className="fa-solid fa-chevron-right"></i></span>
       <span className="crumb-page">{open ? 'Lead Details' : page}</span>
      </div>
     </div>

     <div className="topbar-right">
      <div className="live-clock-badge">
       <span className="live-clock-dot"></span>
       <i className="fa-regular fa-clock"></i>
       <span>{liveClock || '12h Clock'}</span>
      </div>

      <button className="btn btn-primary btn-sm topbar-action-btn" onClick={()=>{nav('All Leads');setQuickAdd(true);}}>
       <i className="fa-solid fa-plus"></i> New Lead
      </button>
     </div>
    </header>

    {due>0&&<div className={'banner'+(over?' bad':'')}>
     <div className="banner-content">
      <i className={`banner-icon fa-solid ${over?'fa-triangle-exclamation':'fa-bell'}`}></i>
      <span><b>{over?`${over} overdue`:''}{over&&due-over?' · ':''}{due-over?`${due-over} due today`:''}</b> — scheduled follow-up reminders (12h format).</span>
     </div>
     <button className="btn btn-sm" onClick={()=>nav('Follow-ups')}>
      <i className="fa-solid fa-arrow-right"></i> View follow-ups
     </button>
    </div>}

    {loading?<div className="page-loading"><i className="fa-solid fa-circle-notch fa-spin"></i> Synchronizing leads…</div>:
     lead?<LeadDetail key={lead.id} lead={lead} {...props} back={()=>setOpen(null)}/>:
     page==='Dashboard'?<Dashboard {...props} onAddLead={()=>{nav('All Leads');setQuickAdd(true);}}/>:
     page==='All Leads'?<Leads {...props} initialAdd={quickAdd} onAddClosed={()=>setQuickAdd(false)}/>:
     page==='Follow-ups'?<FollowUps {...props}/>:
     page==='Calendar'?<Calendar {...props}/>:
     page==='Import Data'?<Import {...props}/>:
     page==='Company Details'?<CompanyDetails/>:<Settings/>}
   </main>
   {toast&&<div className={'toast'+(toast.err?' err':'')}>
    <i className={`fa-solid ${toast.err?'fa-circle-xmark':'fa-circle-check'}`}></i>
    <span>{toast.m}</span>
   </div>}
  </div>
 );
}

type P={leads:Row[],fups:Row[],reload:()=>Promise<void>,say:Say,openLead:(id:string)=>void};

function Dashboard({leads,fups,openLead,onAddLead}:P&{onAddLead:()=>void}){
 const c=(f:(l:Row)=>boolean)=>leads.filter(f).length;
 const recent=[...leads].filter(l=>l.last_contact_at).sort((a,b)=>+new Date(b.last_contact_at)-+new Date(a.last_contact_at)).slice(0,8);
 const b=(k:string)=>fups.filter(f=>bucket(f)===k).length;

 return<>
  <div className="page-header">
   <div>
    <h2><i className="fa-solid fa-gauge-high text-teal"></i> Sales Performance & Pipeline</h2>
    <p className="page-subtitle">Real-time overview of active opportunities, lead temperatures, and pending interactions.</p>
   </div>
   <div className="header-actions">
    <button className="btn btn-primary" onClick={onAddLead}>
     <i className="fa-solid fa-plus"></i> Add New Lead
    </button>
   </div>
  </div>

  <div className="grid">
   <div className="stat-card stat-blue">
    <div className="stat-icon-wrap"><i className="fa-solid fa-users"></i></div>
    <div className="stat-info">
     <b>{leads.length}</b>
     <span>Total Leads</span>
    </div>
   </div>
   <div className="stat-card stat-orange">
    <div className="stat-icon-wrap"><i className="fa-solid fa-fire"></i></div>
    <div className="stat-info">
     <b>{c(l=>l.rating==='Hot')}</b>
     <span>Hot Prospects</span>
    </div>
   </div>
   <div className="stat-card stat-amber">
    <div className="stat-icon-wrap"><i className="fa-solid fa-sun"></i></div>
    <div className="stat-info">
     <b>{c(l=>l.rating==='Warm')}</b>
     <span>Warm Leads</span>
    </div>
   </div>
   <div className="stat-card stat-cyan">
    <div className="stat-icon-wrap"><i className="fa-solid fa-snowflake"></i></div>
    <div className="stat-info">
     <b>{c(l=>l.rating==='Cold')}</b>
     <span>Cold Leads</span>
    </div>
   </div>
   <div className="stat-card stat-red">
    <div className="stat-icon-wrap"><i className="fa-solid fa-triangle-exclamation"></i></div>
    <div className="stat-info">
     <b>{b('overdue')}</b>
     <span>Overdue Follow-ups</span>
    </div>
   </div>
   <div className="stat-card stat-emerald">
    <div className="stat-icon-wrap"><i className="fa-solid fa-bell"></i></div>
    <div className="stat-info">
     <b>{b('today')}</b>
     <span>Due Today</span>
    </div>
   </div>
   <div className="stat-card stat-indigo">
    <div className="stat-icon-wrap"><i className="fa-solid fa-calendar-check"></i></div>
    <div className="stat-info">
     <b>{b('upcoming')}</b>
     <span>Upcoming</span>
    </div>
   </div>
   <div className="stat-card stat-green">
    <div className="stat-icon-wrap"><i className="fa-solid fa-trophy"></i></div>
    <div className="stat-info">
     <b>{c(l=>l.status==='Won')}</b>
     <span>Won Deals</span>
    </div>
   </div>
  </div>

  <div className="card">
   <div className="card-header-row">
    <h3><i className="fa-solid fa-clock-rotate-left text-teal"></i> Recently Contacted Opportunities</h3>
    <span className="card-header-badge">{recent.length} logged interactions</span>
   </div>
   {recent.length?(
    <div className="recent-leads-list">
     {recent.map(l=>(
      <div key={l.id} className="recent-lead-item">
       <div className="recent-lead-main">
        <div className="recent-lead-avatar">
         {l.company_name?.slice(0, 2).toUpperCase() || 'CO'}
        </div>
        <div>
         <a href="#" onClick={e=>{e.preventDefault();openLead(l.id)}} className="recent-lead-title">
          {l.company_name}
         </a>
         <div className="recent-lead-sub">
          {l.contact_person && <span><i className="fa-solid fa-user"></i> {l.contact_person}</span>}
          {l.country && <span><i className="fa-solid fa-location-dot"></i> {l.country}</span>}
         </div>
        </div>
       </div>
       <div className="recent-lead-meta">
        <Tag r={l.rating}/>
        <StatusPill s={l.status}/>
        <span className="recent-lead-time"><i className="fa-regular fa-clock"></i> {fmt(l.last_contact_at)}</span>
       </div>
      </div>
     ))}
    </div>
   ):<p className="mut empty-state"><i className="fa-regular fa-comment-dots"></i> No contact logged yet. Open any lead and log an activity to see it tracked here.</p>}
  </div>
 </>;
}

const empty:Row={company_name:'',rating:'Cold',status:'New',source:'LinkedIn'};

function Leads({leads,reload,say,openLead,initialAdd=false,onAddClosed}:{leads:Row[],fups:Row[],reload:()=>Promise<void>,say:Say,openLead:(id:string)=>void,initialAdd?:boolean,onAddClosed?:()=>void}){
 const[q,setQ]=useState(''),[rt,setRt]=useState(''),[st,setSt]=useState(''),[sv,setSv]=useState(''),[adding,setAdding]=useState(initialAdd),[page,setPage]=useState(0);

 useEffect(()=>{
  if(initialAdd) setAdding(true);
 },[initialAdd]);

 const list=useMemo(()=>{
  const t=q.toLowerCase().trim();
  return leads.filter(l=>(!rt||l.rating===rt)&&(!st||l.status===st)&&(!sv||l.service_interest===sv)&&
  (!t||['company_name','contact_person','email','phone','country','industry','job_title','source'].some(k=>(l[k]||'').toLowerCase().includes(t))));
 },[leads,q,rt,st,sv]);
 useEffect(()=>setPage(0),[q,rt,st,sv]);

 const create=async(v:Row)=>{
  const rec=Object.fromEntries(Object.entries(v).filter(([,x])=>x!=='' && x !== null));
  if(!rec.company_name)return say('Company name is required',true);
  const{data,error}=await supabase.from('leads').insert(rec).select('id').single();
  if(error)return say(error.message,true);
  await logAct(data.id,'Note','Lead added manually');
  setAdding(false);
  if(onAddClosed) onAddClosed();
  await reload();say('Lead added successfully!');
 };

 const exportCsv=()=>{
  const rows=list.map(l=>Object.fromEntries([...FIELDS.map(f=>[f.label,safeCell(l[f.key]??'')]),['Last contact',fmt(l.last_contact_at)]]));
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([Papa.unparse(rows)],{type:'text/csv'}));a.download='elite-leads.csv';a.click();
 };

 const per=50,shown=list.slice(page*per,page*per+per);
 const opt=(l:string[],a:string)=><><option value="">{a}</option>{l.map(x=><option key={x}>{x}</option>)}</>;

 return<>
  <div className="page-header">
   <div>
    <h2><i className="fa-solid fa-address-book text-teal"></i> All Leads Database <span className="header-count-pill">{list.length} records</span></h2>
    <p className="page-subtitle">Search, filter, edit, and organize prospects for outbound and inbound sales.</p>
   </div>
   <div className="header-actions">
    <button className="btn btn-primary" onClick={()=>{setAdding(!adding);if(adding&&onAddClosed)onAddClosed();}}>
     <i className={`fa-solid ${adding?'fa-xmark':'fa-plus'}`}></i> {adding?'Close Form':'Add New Lead'}
    </button>
    <button className="btn btn-secondary" disabled={!list.length} onClick={exportCsv}>
     <i className="fa-solid fa-file-arrow-down"></i> Export CSV
    </button>
   </div>
  </div>

  <div className="table-controls-card">
   <div className="search-bar-wrap">
    <i className="fa-solid fa-magnifying-glass search-icon"></i>
    <input
     placeholder="Search by company, person, job title, email, phone, country…"
     value={q}
     onChange={e=>setQ(e.target.value)}
    />
    {q && <button className="clear-search-btn" onClick={()=>setQ('')}><i className="fa-solid fa-xmark"></i></button>}
   </div>
   <div className="filter-group">
    <select value={rt} onChange={e=>setRt(e.target.value)} className="filter-select">
     {opt(RATINGS,'Filter Rating: All')}
    </select>
    <select value={st} onChange={e=>setSt(e.target.value)} className="filter-select">
     {opt(STATUSES,'Filter Status: All')}
    </select>
    <select value={sv} onChange={e=>setSv(e.target.value)} className="filter-select">
     {opt(SERVICES,'Filter Service: All')}
    </select>
   </div>
  </div>

  {adding&&<div style={{marginBottom: 20}}><LeadForm init={empty} onSave={create} onCancel={()=>{setAdding(false);if(onAddClosed)onAddClosed();}}/></div>}

  <div className="tw modern-table-wrap">
   <table className="modern-table">
    <thead>
     <tr>
      <th><i className="fa-solid fa-building"></i> Company</th>
      <th><i className="fa-solid fa-user"></i> Contact & Role</th>
      <th><i className="fa-solid fa-fire"></i> Rating</th>
      <th><i className="fa-solid fa-circle-notch"></i> Status</th>
      <th><i className="fa-solid fa-layer-group"></i> Service</th>
      <th><i className="fa-solid fa-bullhorn"></i> Source</th>
      <th><i className="fa-regular fa-clock"></i> Last Contact (12h)</th>
      <th style={{textAlign:'right'}}>Action</th>
     </tr>
    </thead>
    <tbody>
     {shown.map(l=><tr key={l.id} className="click" onClick={()=>openLead(l.id)}>
      <td>
       <div className="cell-company">
        <b>{l.company_name}</b>
        {l.country && <span className="cell-country"><i className="fa-solid fa-location-dot"></i> {l.country}</span>}
       </div>
      </td>
      <td>
       <div className="cell-contact">
        <span>{l.contact_person||'—'}</span>
        {l.job_title && <span className="cell-job-title">{l.job_title}</span>}
       </div>
      </td>
      <td><Tag r={l.rating}/></td>
      <td><StatusPill s={l.status}/></td>
      <td><span className="cell-service">{l.service_interest||'—'}</span></td>
      <td><span className="cell-source">{l.source||'—'}</span></td>
      <td><span className="cell-time">{fmt(l.last_contact_at)}</span></td>
      <td style={{textAlign:'right'}}>
       <span className="table-row-view-btn"><i className="fa-solid fa-chevron-right"></i></span>
      </td>
     </tr>)}
     {!shown.length&&<tr>
      <td colSpan={8} className="mut empty-table-cell">
       <i className="fa-regular fa-folder-open"></i> {leads.length?'No leads match these search filters. Try clearing your search.':'No leads in database yet. Click "Add New Lead" or use "Import Data".'}
      </td>
     </tr>}
    </tbody>
   </table>
  </div>

  {list.length>per&&<div className="pagination-row">
   <button className="btn btn-secondary btn-sm" disabled={!page} onClick={()=>setPage(page-1)}>
    <i className="fa-solid fa-chevron-left"></i> Previous
   </button>
   <span className="pagination-info">Page <b>{page+1}</b> of <b>{Math.ceil(list.length/per)}</b> ({list.length} total)</span>
   <button className="btn btn-secondary btn-sm" disabled={(page+1)*per>=list.length} onClick={()=>setPage(page+1)}>
    Next <i className="fa-solid fa-chevron-right"></i>
   </button>
  </div>}
 </>;
}

function Schedule({lead,say,done,label='Schedule Follow-up'}:{lead:Row,say:Say,done:()=>void,label?:string}){
 const[due,setDue]=useState(''),[m,setM]=useState('Email'),[a,setA]=useState(''),[n,setN]=useState('');
 const save=async()=>{
  if(!due)return say('Please select a date and time',true);
  const iso=new Date(due).toISOString();
  const{error}=await supabase.from('follow_ups').insert({lead_id:lead.id,due_at:iso,method:m,next_action:a||null,notes:n||null});
  if(error)return say(error.message,true);
  await logAct(lead.id,'Follow-up scheduled',`${m} on ${fmt(iso)}`,[a,n].filter(Boolean).join(' — '));
  setDue('');setA('');setN('');say('Follow-up scheduled successfully');done();
 };

 return<div className="schedule-box">
  <div className="schedule-header"><i className="fa-solid fa-calendar-plus"></i> Set Follow-up Reminder</div>
  <div className="row">
   <div>
    <label className="field-label-sm"><i className="fa-regular fa-calendar"></i> Date & Time</label>
    <input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/>
   </div>
   <div>
    <label className="field-label-sm"><i className="fa-solid fa-paper-plane"></i> Contact Channel</label>
    <select value={m} onChange={e=>setM(e.target.value)}>{METHODS.map(x=><option key={x}>{x}</option>)}</select>
   </div>
  </div>
  {due&&<div className="hint-12h"><i className="fa-regular fa-clock"></i> 12-Hour Confirmation: <b>{fmt(due)}</b></div>}
  <div className="row">
   <input placeholder="Next action (e.g. Send portfolio / Discuss proposal)" value={a} onChange={e=>setA(e.target.value)}/>
   <input placeholder="Internal notes for this follow-up" value={n} onChange={e=>setN(e.target.value)}/>
   <button className="btn btn-primary" onClick={save}><i className="fa-solid fa-check"></i> {label}</button>
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
  say('Follow-up marked as completed!');setOpen(false);done();
 };
 return open?(
  <div className="row" style={{marginBottom:0,alignItems:'center'}}>
   <input placeholder="Add outcome summary (optional)" value={out} onChange={e=>setOut(e.target.value)}/>
   <button className="btn btn-primary btn-sm" onClick={go}><i className="fa-solid fa-check"></i> Confirm</button>
   <button className="btn btn-secondary btn-sm" onClick={()=>setOpen(false)}><i className="fa-solid fa-xmark"></i></button>
  </div>
 ):<button className="btn btn-secondary btn-sm" onClick={()=>setOpen(true)}><i className="fa-solid fa-circle-check"></i> Mark complete</button>;
}

function FollowUps({fups,reload,say,openLead}:P){
 const[next,setNext]=useState<Row|null>(null);
 const grp=(k:string,t:string,icon:string)=>{
  const l=fups.filter(f=>bucket(f)===k);
  return<div className="followup-group-card">
   <div className={`followup-group-title ${k==='overdue'?'overdue':k==='today'?'due-today':''}`}>
    <i className={icon}></i>
    <span>{t}</span>
    <span className="followup-count-badge">{l.length}</span>
   </div>
   <div className="followup-items-list">
    {l.map(f=><div className="card followup-item-card" key={f.id}>
     <div className="followup-card-top">
      <a href="#" onClick={e=>{e.preventDefault();openLead(f.lead_id)}} className="followup-lead-link">
       <i className="fa-solid fa-building"></i> <b>{f.leads?.company_name}</b>
      </a>
      <span className={`followup-due-tag ${k==='overdue'?'tag-overdue':''}`}>
       <i className="fa-regular fa-clock"></i> {fmt(f.due_at)}
      </span>
     </div>

     <div className="followup-action-line">
      <span className="followup-channel-badge"><MethodIcon m={f.method}/> {f.method}</span>
      <span className="followup-action-text">{f.next_action||'No next action specified'}</span>
      {f.notes&&<span className="followup-notes-text"> — {f.notes}</span>}
     </div>

     <div className="row" style={{marginTop:12,marginBottom:0}}>
      <Complete f={f} say={say} done={async()=>{await reload();}}/>
      <button className="btn btn-secondary btn-sm" onClick={()=>setNext(next?.id===f.id?null:f)}>
       <i className="fa-solid fa-calendar-plus"></i> Schedule Next
      </button>
     </div>
     {next?.id===f.id&&<div style={{marginTop:14}}>
      <Schedule lead={{id:f.lead_id}} say={say} label="Save Follow-up" done={async()=>{setNext(null);await reload();}}/>
     </div>}
    </div>)}
    {!l.length&&<p className="mut empty-followup-text"><i className="fa-regular fa-circle-check"></i> No items in this section.</p>}
   </div>
  </div>;
 };

 return<>
  <div className="page-header">
   <div>
    <h2><i className="fa-solid fa-clock-rotate-left text-teal"></i> Follow-up Pipeline</h2>
    <p className="page-subtitle">Track timely follow-ups across email, WhatsApp, LinkedIn, and calls.</p>
   </div>
  </div>
  {grp('overdue','Overdue Follow-ups','fa-solid fa-triangle-exclamation text-rose')}
  {grp('today','Due Today','fa-solid fa-bell text-amber')}
  {grp('upcoming','Upcoming Scheduled','fa-solid fa-calendar-days text-indigo')}
 </>;
}

function Calendar({fups,openLead}:P){
 const days=new Map<string,Row[]>();
 fups.forEach(f=>{
  const k=new Date(f.due_at).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
  days.set(k,[...(days.get(k)||[]),f]);
 });

 return<>
  <div className="page-header">
   <div>
    <h2><i className="fa-solid fa-calendar-days text-teal"></i> Follow-up Calendar</h2>
    <p className="page-subtitle">Upcoming calls, meetings, and client follow-ups organized by day (12-hour AM/PM).</p>
   </div>
  </div>

  <div className="calendar-grid">
   {[...days].map(([d,l])=><div className="card calendar-day-card" key={d}>
    <div className="calendar-day-header">
     <div className="calendar-day-title">
      <i className="fa-regular fa-calendar"></i> {d}
     </div>
     <span className="calendar-count-badge">{l.length} follow-up{l.length>1?'s':''}</span>
    </div>
    <div className="calendar-items-list">
     {l.map(f=><div key={f.id} className="calendar-item-row">
      <span className="calendar-time-pill">
       <i className="fa-regular fa-clock"></i> {fmtTime(f.due_at)}
      </span>
      <span className="calendar-channel"><MethodIcon m={f.method}/> {f.method}</span>
      <a href="#" onClick={e=>{e.preventDefault();openLead(f.lead_id)}} className="calendar-lead-link">
       <i className="fa-solid fa-building"></i> {f.leads?.company_name}
      </a>
      <span className="calendar-action-note">{f.next_action}</span>
     </div>)}
    </div>
   </div>)}
  </div>
  {!days.size&&<div className="card empty-state-card">
   <i className="fa-regular fa-calendar-check empty-state-icon"></i>
   <h3>No Pending Follow-ups</h3>
   <p className="mut">Your calendar is clear. Schedule follow-ups from the All Leads table.</p>
  </div>}
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
  setEdit(false);await refresh();say('Lead updated successfully!');
 };

 const addAct=async()=>{
  if(!sum.trim())return say('Write a short activity summary',true);
  const{error}=await logAct(lead.id,type,sum.trim());if(error)return say(error.message,true);
  if(type!=='Note')await supabase.from('leads').update({last_contact_at:new Date().toISOString()}).eq('id',lead.id);
  setSum('');await refresh();say('Activity logged to timeline!');
 };

 const convert=async()=>{
  if(!confirm('Mark this lead as WON and convert to permanent client?'))return;
  const{error}=await supabase.rpc('convert_lead_to_client',{p_lead_id:lead.id});
  if(error)return say(error.message,true);
  await refresh();say('Lead successfully converted to Client! 🎉');
 };

 const remove=async()=>{
  if(!confirm('Permanently delete this lead and its entire history?'))return;
  const{error}=await supabase.from('leads').delete().eq('id',lead.id);if(error)return say(error.message,true);
  await reload();back();say('Lead deleted.');
 };

 const getActivityIcon=(t:string)=>{
  if(t==='Converted') return 'fa-solid fa-trophy text-won';
  if(t==='Status change'||t==='Rating change') return 'fa-solid fa-arrows-rotate text-blue';
  if(t==='Follow-up scheduled'||t==='Follow-up completed') return 'fa-solid fa-calendar-check text-indigo';
  if(t==='Email') return 'fa-solid fa-envelope text-blue';
  if(t==='WhatsApp') return 'fa-brands fa-whatsapp text-emerald';
  if(t==='Phone') return 'fa-solid fa-phone text-purple';
  if(t==='LinkedIn') return 'fa-brands fa-linkedin text-cyan';
  if(t==='Imported') return 'fa-solid fa-file-arrow-up text-amber';
  return 'fa-solid fa-note-sticky text-teal';
 };

 const phoneClean = (lead.phone || '').replace(/[^0-9]/g, '');

 return<>
  <div className="lead-detail-top-nav">
   <button className="btn btn-secondary btn-sm" onClick={back}>
    <i className="fa-solid fa-arrow-left"></i> Back to all leads
   </button>
   <div className="lead-detail-quick-actions">
    <button className="btn btn-secondary btn-sm" onClick={()=>setEdit(!edit)}>
     <i className="fa-solid fa-pen-to-square"></i> {edit?'Close Form':'Edit Lead'}
    </button>
    {lead.status!=='Won'&&<button className="btn btn-success btn-sm" onClick={convert}>
     <i className="fa-solid fa-trophy"></i> Mark Won & Convert
    </button>}
    <button className="btn btn-danger btn-sm" onClick={remove}>
     <i className="fa-solid fa-trash"></i> Delete
    </button>
   </div>
  </div>

  <div className="lead-profile-banner">
   <div className="lead-profile-header">
    <div className="lead-avatar-icon">
     {lead.company_name?.slice(0, 2).toUpperCase() || 'CO'}
    </div>
    <div>
     <div className="lead-title-row">
      <h2 style={{margin:0}}>{lead.company_name}</h2>
      <Tag r={lead.rating}/>
      <StatusPill s={lead.status}/>
     </div>
     <div className="lead-meta-row">
      {lead.contact_person && <span><i className="fa-solid fa-user"></i> {lead.contact_person}</span>}
      {lead.job_title && <span><i className="fa-solid fa-briefcase"></i> {lead.job_title}</span>}
      {lead.country && <span><i className="fa-solid fa-location-dot"></i> {lead.country}</span>}
      {lead.service_interest && <span><i className="fa-solid fa-layer-group"></i> {lead.service_interest}</span>}
     </div>

     {/* Quick 1-Click Action Buttons */}
     <div className="lead-action-pills-row">
      {lead.email && (
       <a href={`mailto:${lead.email}`} className="quick-action-pill email-pill" title="Send Email">
        <i className="fa-solid fa-envelope"></i> Send Email
       </a>
      )}
      {lead.phone && (
       <>
        <a href={`https://wa.me/${phoneClean}`} target="_blank" rel="noreferrer" className="quick-action-pill whatsapp-pill" title="Chat on WhatsApp">
         <i className="fa-brands fa-whatsapp"></i> WhatsApp
        </a>
        <a href={`tel:${lead.phone}`} className="quick-action-pill phone-pill" title="Call Contact">
         <i className="fa-solid fa-phone"></i> Call
        </a>
       </>
      )}
      {lead.website && (
       <a href={lead.website.startsWith('http')?lead.website:`https://${lead.website}`} target="_blank" rel="noreferrer" className="quick-action-pill website-pill">
        <i className="fa-solid fa-globe"></i> Visit Website <i className="fa-solid fa-arrow-up-right-from-square small-icon"></i>
       </a>
      )}
      {lead.linkedin_url && (
       <a href={lead.linkedin_url.startsWith('http')?lead.linkedin_url:`https://${lead.linkedin_url}`} target="_blank" rel="noreferrer" className="quick-action-pill linkedin-pill">
        <i className="fa-brands fa-linkedin"></i> LinkedIn <i className="fa-solid fa-arrow-up-right-from-square small-icon"></i>
       </a>
      )}
     </div>
    </div>
   </div>
  </div>

  {edit?<div style={{marginBottom: 20}}><LeadForm init={lead} onSave={save} onCancel={()=>setEdit(false)}/></div>:(
   <div className="lead-detail-grid">
    <div className="lead-detail-main-col">
     <div className="card">
      <div className="card-header-row">
       <h3><i className="fa-solid fa-id-card text-teal"></i> Contact & Business Specifications</h3>
      </div>
      <div className="lead-info-specs">
       <div className="info-spec-item">
        <span className="spec-label"><i className="fa-solid fa-envelope"></i> Email Address</span>
        <span className="spec-value">{lead.email?<a href={`mailto:${lead.email}`}>{lead.email}</a>:'—'}</span>
       </div>
       <div className="info-spec-item">
        <span className="spec-label"><i className="fa-solid fa-phone"></i> Phone / WhatsApp</span>
        <span className="spec-value">{lead.phone?<a href={`tel:${lead.phone}`}>{lead.phone}</a>:'—'}</span>
       </div>
       <div className="info-spec-item">
        <span className="spec-label"><i className="fa-solid fa-globe"></i> Website</span>
        <span className="spec-value">{lead.website?<a href={lead.website.startsWith('http')?lead.website:`https://${lead.website}`} target="_blank" rel="noreferrer">{lead.website} <i className="fa-solid fa-arrow-up-right-from-square"></i></a>:'—'}</span>
       </div>
       <div className="info-spec-item">
        <span className="spec-label"><i className="fa-brands fa-linkedin"></i> LinkedIn URL</span>
        <span className="spec-value">{lead.linkedin_url?<a href={lead.linkedin_url.startsWith('http')?lead.linkedin_url:`https://${lead.linkedin_url}`} target="_blank" rel="noreferrer">View LinkedIn Profile <i className="fa-solid fa-arrow-up-right-from-square"></i></a>:'—'}</span>
       </div>
       <div className="info-spec-item">
        <span className="spec-label"><i className="fa-solid fa-industry"></i> Industry Sector</span>
        <span className="spec-value">{lead.industry||'—'}</span>
       </div>
       <div className="info-spec-item">
        <span className="spec-label"><i className="fa-solid fa-bullhorn"></i> Lead Source</span>
        <span className="spec-value">{lead.source||'—'}</span>
       </div>
       <div className="info-spec-item">
        <span className="spec-label"><i className="fa-solid fa-layer-group"></i> Service Interest</span>
        <span className="spec-value">{lead.service_interest||'—'}</span>
       </div>
       <div className="info-spec-item">
        <span className="spec-label"><i className="fa-regular fa-clock"></i> Last Interaction</span>
        <span className="spec-value">{fmt(lead.last_contact_at)}</span>
       </div>
      </div>

      {lead.promising_reason&&(
       <div className="opportunity-highlight-box">
        <div className="opportunity-title"><i className="fa-solid fa-star text-amber"></i> Why This Lead Is Promising</div>
        <div>{lead.promising_reason}</div>
       </div>
      )}

      {lead.notes&&(
       <div className="notes-highlight-box">
        <div className="notes-title"><i className="fa-solid fa-clipboard-list text-teal"></i> Internal Personal Notes & History</div>
        <div style={{whiteSpace:'pre-wrap'}}>{lead.notes}</div>
       </div>
      )}
     </div>

     {/* Activity Timeline in Main Column */}
     <div className="card">
      <div className="card-header-row">
       <h3><i className="fa-solid fa-timeline text-teal"></i> Activity Timeline</h3>
       <span className="card-header-badge">{acts.length} logged events</span>
      </div>
      <div className="log-activity-form">
       <select value={type} onChange={e=>setType(e.target.value)}>
        {['Note',...METHODS].map(x=><option key={x}>{x}</option>)}
       </select>
       <input
        placeholder="What happened? (e.g. Discussed proposal via call, sent pricing)"
        value={sum}
        onChange={e=>setSum(e.target.value)}
        onKeyDown={e=>e.key==='Enter'&&addAct()}
       />
       <button className="btn btn-primary btn-sm" onClick={addAct}>
        <i className="fa-solid fa-plus"></i> Log Activity
       </button>
      </div>
      <div className="timeline-wrap">
       {acts.map(a=><div key={a.id} className="timeline-node">
        <div className="timeline-icon-box"><i className={getActivityIcon(a.type)}></i></div>
        <div className="timeline-content">
         <div className="timeline-header-line">
          <b>{a.type}</b> — {a.summary}
         </div>
         {a.details&&<div className="timeline-details-text">{a.details}</div>}
         <div className="timeline-timestamp"><i className="fa-regular fa-clock"></i> {fmt(a.occurred_at)}</div>
        </div>
       </div>)}
       {!acts.length&&<p className="mut" style={{fontSize: 13}}>No activity logged yet.</p>}
      </div>
     </div>
    </div>

    <div className="lead-detail-sidebar-col">
     {/* Quick Stage & Temperature Card */}
     <div className="card">
      <div className="card-header-row">
       <h3><i className="fa-solid fa-gauge text-teal"></i> Lead Status & Stage</h3>
      </div>
      
      <div className="lead-quick-controls">
       <div style={{marginBottom: 14}}>
        <label className="field-label-sm"><i className="fa-solid fa-circle-notch"></i> Pipeline Status</label>
        <select
         value={lead.status}
         onChange={async e => {
          const newSt = e.target.value;
          const { error } = await supabase.from('leads').update({ status: newSt }).eq('id', lead.id);
          if (error) return say(error.message, true);
          await logAct(lead.id, 'Status change', `${lead.status} → ${newSt}`);
          await refresh();
          say('Status updated to ' + newSt);
         }}
         className="sidebar-stage-select"
        >
         {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
       </div>

       <div>
        <label className="field-label-sm"><i className="fa-solid fa-fire"></i> Temperature Rating</label>
        <div className="rating-toggle-pills">
         {RATINGS.map(r => (
          <button
           key={r}
           type="button"
           className={`rating-pill-btn ${lead.rating === r ? 'active ' + r : ''}`}
           onClick={async () => {
            if (lead.rating === r) return;
            const { error } = await supabase.from('leads').update({ rating: r }).eq('id', lead.id);
            if (error) return say(error.message, true);
            await logAct(lead.id, 'Rating change', `${lead.rating} → ${r}`);
            await refresh();
            say('Rating updated to ' + r);
           }}
          >
           {r === 'Hot' ? '🔥 Hot' : r === 'Warm' ? '☀️ Warm' : '❄️ Cold'}
          </button>
         ))}
        </div>
       </div>

       {lead.status !== 'Won' && (
        <button className="btn btn-success" style={{width: '100%', marginTop: 16}} onClick={convert}>
         <i className="fa-solid fa-trophy"></i> Mark Won & Convert
        </button>
       )}
      </div>
     </div>

     {/* Scheduled Reminders */}
     <div className="card">
      <div className="card-header-row">
       <h3><i className="fa-solid fa-clock-rotate-left text-teal"></i> Scheduled Reminders</h3>
       <span className="header-count-pill">{mine.length}</span>
      </div>
      {mine.map(f=><div key={f.id} className="lead-followup-item">
       <div className="lead-followup-time"><i className="fa-regular fa-clock"></i> {fmt(f.due_at)} · {f.method}</div>
       <div className="lead-followup-action">{f.next_action||'Follow-up scheduled'}</div>
       <div style={{marginTop: 8}}><Complete f={f} say={say} done={refresh}/></div>
      </div>)}
      {!mine.length&&<p className="mut" style={{fontSize: 13}}><i className="fa-solid fa-circle-check text-emerald"></i> No pending reminders for this lead.</p>}
      <div style={{marginTop: 16}}>
       <Schedule lead={lead} say={say} done={refresh}/>
      </div>
     </div>
    </div>
   </div>
  )}
 </>;
}

function Import({leads,reload,say}:P){
 const[file,setFile]=useState(''),[rows,setRows]=useState<Row[]>([]),[map,setMap]=useState<Record<string,string>>({}),[dupes,setDupes]=useState(false),[busy,setBusy]=useState(false);
 const headers=Object.keys(map);
 const built=useMemo<Built[]>(()=>rows.length?buildRows(rows,map,existingFrom(leads)):[],[rows,map,leads]);
 const good=built.filter(b=>!b.errors.length&&(dupes||!b.duplicateOf)),bad=built.filter(b=>b.errors.length),dup=built.filter(b=>!b.errors.length&&b.duplicateOf);

 const onFile=(f?:File)=>{
  if(!f)return;setFile(f.name);
  if(/\.xlsx?$/i.test(f.name))return say('Excel files are not supported. In Excel use File → Save As → CSV, then upload that.',true);
  Papa.parse<Row>(f,{header:true,skipEmptyLines:true,complete:r=>{
   if(!r.meta.fields?.length)return say('No header row found in this CSV',true);
   setRows(r.data);setMap(autoMap(r.meta.fields));
  },error:e=>say(e.message,true)});
 };

 const template=()=>{
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([Papa.unparse({
   fields:FIELDS.map(f=>f.label),
   data:[['Acme Corp','Jane Doe','CTO','jane@example.com','+91 98765 43210','https://example.com','https://linkedin.com/in/jane','India','Web Development','LinkedIn','Warm','New','Web Development','Needs web redesign','Met on LinkedIn']]
  })],{type:'text/csv'}));
  a.download='elite-leads-template.csv';a.click();
 };

 const run=async()=>{
  if(!map||!Object.values(map).includes('company_name'))return say('Please map at least one column to Company Name',true);
  setBusy(true);let n=0;
  try{
   for(let i=0;i<good.length;i+=500){
    const chunk=good.slice(i,i+500).map(b=>b.record);
    const{data,error}=await supabase.from('leads').insert(chunk).select('id');
    if(error)throw new Error(`${error.message} (${n} imported before this error)`);
    n+=data.length;
    await supabase.from('activities').insert(data.map(d=>({lead_id:d.id,type:'Imported',summary:'Bulk imported from '+file})));
   }
   say(`Successfully imported ${n} leads into Supabase!`);setRows([]);setMap({});setFile('');await reload();
  }catch(e:any){say(e.message,true);await reload();}
  setBusy(false);
 };

 return<>
  <div className="page-header">
   <div>
    <h2><i className="fa-solid fa-file-arrow-up text-teal"></i> Bulk Import Leads</h2>
    <p className="page-subtitle">Upload CSV lists from LinkedIn, Apollo, scrapers, or spreadsheets.</p>
   </div>
   <div className="header-actions">
    <button className="btn btn-secondary" onClick={template}>
     <i className="fa-solid fa-download"></i> Download Sample CSV
    </button>
   </div>
  </div>

  <div className="card import-drop-card">
   <div className="import-icon-circle"><i className="fa-solid fa-cloud-arrow-up"></i></div>
   <h3>Upload CSV Spreadsheet</h3>
   <p className="mut">Select a CSV file containing your leads. You can map every column to CRM fields before saving.</p>
   <div className="file-input-wrapper">
    <input type="file" accept=".csv,text/csv" onChange={e=>onFile(e.target.files?.[0])} id="csv-upload-input"/>
   </div>
   {file && <div className="selected-file-badge"><i className="fa-solid fa-file-csv"></i> Loaded: <b>{file}</b> ({rows.length} rows)</div>}
  </div>

  {rows.length>0&&<>
   <div className="card">
    <div className="card-header-row">
     <h3><i className="fa-solid fa-arrows-split-up-and-left text-teal"></i> Map CSV Headers to CRM Fields</h3>
     <span className="header-count-pill">{headers.length} columns detected</span>
    </div>
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
    <div className="stat-card stat-emerald">
     <div className="stat-icon-wrap"><i className="fa-solid fa-circle-check"></i></div>
     <div className="stat-info"><b>{good.length}</b><span>Ready to Import</span></div>
    </div>
    <div className="stat-card stat-amber">
     <div className="stat-icon-wrap"><i className="fa-solid fa-copy"></i></div>
     <div className="stat-info"><b>{dup.length}</b><span>Likely Duplicates</span></div>
    </div>
    <div className="stat-card stat-red">
     <div className="stat-icon-wrap"><i className="fa-solid fa-triangle-exclamation"></i></div>
     <div className="stat-info"><b>{bad.length}</b><span>Rows with Errors</span></div>
    </div>
   </div>

   <label className="checkbox-custom-label">
    <input type="checkbox" checked={dupes} onChange={e=>setDupes(e.target.checked)}/>
    <span>Import likely duplicates anyway (bypass duplicate email/company check)</span>
   </label>

   <div className="tw modern-table-wrap" style={{marginTop:14}}>
    <table className="modern-table">
     <thead><tr><th>Row</th><th>Company</th><th>Email</th><th>Validation Result</th></tr></thead>
     <tbody>
      {built.slice(0,100).map(b=><tr key={b.line}>
       <td><b>#{b.line}</b></td>
       <td>{b.record.company_name||'—'}</td>
       <td>{b.record.email||'—'}</td>
       <td>
        {b.errors.length?<span className="validation-pill error"><i className="fa-solid fa-circle-exclamation"></i> {b.errors[0]}</span>:
         b.duplicateOf?<span className="validation-pill warn"><i className="fa-solid fa-copy"></i> Duplicate: {b.duplicateOf}</span>:
         <span className="validation-pill success"><i className="fa-solid fa-check"></i> Valid</span>}
       </td>
      </tr>)}
     </tbody>
    </table>
   </div>

   <button className="btn btn-primary" style={{marginTop: 16}} disabled={busy||!good.length} onClick={run}>
    {busy?<><i className="fa-solid fa-spinner fa-spin"></i> Processing…</>:<><i className="fa-solid fa-cloud-arrow-up"></i> Import {good.length} Verified Leads</>}
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
  <div className="page-header">
   <div>
    <h2><i className="fa-solid fa-building text-teal"></i> Company Profile & Information</h2>
    <p className="page-subtitle">Official branding, contact channels, and service specifications from eliteinfotec.in.</p>
   </div>
  </div>

  <div className="company-hero">
   <div className="company-hero-top">
    <img src="/elite-logo.png" alt="EliteInfotec" className="company-hero-logo"/>
    <a href="https://eliteinfotec.in" target="_blank" rel="noreferrer" className="btn btn-hero">
     <i className="fa-solid fa-arrow-up-right-from-square"></i> Visit Official Website
    </a>
   </div>
   <p>Top-rated IT & Web Development Company in India. Trusted by global clients for custom web apps, mobile apps, UI/UX design, and AI automation.</p>
  </div>

  <div className="company-contact-grid">
   <div className="company-contact-box">
    <div className="contact-box-header">
     <i className="fa-solid fa-globe contact-box-icon text-cyan"></i>
     <h4>Official Website</h4>
    </div>
    <div><a href="https://eliteinfotec.in" target="_blank" rel="noreferrer">eliteinfotec.in</a></div>
   </div>
   <div className="company-contact-box">
    <div className="contact-box-header">
     <i className="fa-solid fa-envelope contact-box-icon text-blue"></i>
     <h4>Email Address</h4>
    </div>
    <div><a href="mailto:info@eliteinfotec.in">info@eliteinfotec.in</a></div>
   </div>
   <div className="company-contact-box">
    <div className="contact-box-header">
     <i className="fa-brands fa-whatsapp contact-box-icon text-emerald"></i>
     <h4>Phone / WhatsApp</h4>
    </div>
    <div><a href="tel:+918128234673">+91 812 823 4673</a></div>
   </div>
   <div className="company-contact-box">
    <div className="contact-box-header">
     <i className="fa-solid fa-location-dot contact-box-icon text-rose"></i>
     <h4>Office Headquarters</h4>
    </div>
    <div style={{fontSize:13,lineHeight:1.4}}>
     "RK Iconic" A-wing 10th floor, Office No. 1004, Near Shital Park BRTS Bus Stop, 150ft Ring Road, Rajkot 360005, Gujarat, India
    </div>
   </div>
  </div>

  <div className="card">
   <div className="card-header-row">
    <h3><i className="fa-solid fa-layer-group text-teal"></i> Solutions & Services Portfolio</h3>
   </div>
   <div className="badge-pills-row">
    {services.map(s=><span key={s} className="service-pill"><i className="fa-solid fa-check text-emerald"></i> {s}</span>)}
   </div>

   <h3 style={{marginTop:20}}><i className="fa-solid fa-code text-teal"></i> Core Technology Stack</h3>
   <div className="badge-pills-row">
    {technologies.map(t=><span key={t} className="tech-pill"><i className="fa-solid fa-cube text-cyan"></i> {t}</span>)}
   </div>
  </div>

  <div className="card">
   <div className="card-header-row">
    <h3><i className="fa-solid fa-share-nodes text-teal"></i> Official Social Channels</h3>
   </div>
   <div className="social-links-row">
    <a href="https://in.linkedin.com/company/eliteinfotec" target="_blank" rel="noreferrer" className="btn btn-secondary social-btn linkedin">
     <i className="fa-brands fa-linkedin"></i> LinkedIn Company Page <i className="fa-solid fa-arrow-up-right-from-square small-link-icon"></i>
    </a>
    <a href="https://www.instagram.com/elite_infotec/" target="_blank" rel="noreferrer" className="btn btn-secondary social-btn instagram">
     <i className="fa-brands fa-instagram"></i> Instagram <i className="fa-solid fa-arrow-up-right-from-square small-link-icon"></i>
    </a>
    <a href="https://www.facebook.com/EliteInfotectechnologies" target="_blank" rel="noreferrer" className="btn btn-secondary social-btn facebook">
     <i className="fa-brands fa-facebook"></i> Facebook <i className="fa-solid fa-arrow-up-right-from-square small-link-icon"></i>
    </a>
   </div>
  </div>
 </>;
}

function Settings(){
 return<>
  <div className="page-header">
   <div>
    <h2><i className="fa-solid fa-sliders text-teal"></i> System Configuration & Settings</h2>
    <p className="page-subtitle">Security parameters, cloud database connectivity, and active session controls.</p>
   </div>
  </div>

  <div className="settings-grid">
   <div className="card">
    <div className="card-header-row">
     <h3><i className="fa-solid fa-shield-halved text-emerald"></i> Security & Database</h3>
    </div>
    <p>Your lead database is securely hosted on dedicated Supabase cloud infrastructure protected with PostgreSQL Row-Level Security (RLS).</p>
    <div className="settings-badge-list">
     <div className="settings-spec-line">
      <span><i className="fa-solid fa-clock text-teal"></i> Time Display:</span>
      <b>12-Hour Clock with AM/PM (Active)</b>
     </div>
     <div className="settings-spec-line">
      <span><i className="fa-solid fa-database text-blue"></i> Storage Mode:</span>
      <b>Encrypted Cloud Postgres</b>
     </div>
     <div className="settings-spec-line">
      <span><i className="fa-solid fa-lock text-emerald"></i> Authentication:</span>
      <b>Supabase Auth (Direct Owner Only)</b>
     </div>
    </div>
   </div>

   <div className="card">
    <div className="card-header-row">
     <h3><i className="fa-solid fa-arrow-right-from-bracket text-rose"></i> Session Management</h3>
    </div>
    <p className="mut">Signing out terminates your local session. You will need your Supabase email & password to sign in again.</p>
    <button className="btn btn-danger" onClick={()=>supabase.auth.signOut()}>
     <i className="fa-solid fa-right-from-bracket"></i> Sign out of CRM
    </button>
   </div>
  </div>
 </>;
}
