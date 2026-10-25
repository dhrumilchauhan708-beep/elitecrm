import {useCallback,useEffect,useMemo,useState} from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {supabase,configured} from './supabase';
import {FIELDS,RATINGS,STATUSES,SERVICES,METHODS,autoMap,buildRows,existingFrom,safeCell,Built} from './importLogic';
import {LeadForm} from './LeadForm';
import {MEETING_SOURCES} from './leadOptions';
import {ActivityTimeline} from './ActivityTimeline';

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

export const MEETING_PLATFORMS = [
 { id: 'Google Meet', label: 'Google Meet', icon: 'fa-solid fa-video', defaultMethod: 'Other' },
 { id: 'Zoom', label: 'Zoom Meeting', icon: 'fa-solid fa-video', defaultMethod: 'Other' },
 { id: 'Microsoft Teams', label: 'Microsoft Teams', icon: 'fa-solid fa-users-rectangle', defaultMethod: 'Other' },
 { id: 'WhatsApp', label: 'WhatsApp Call / Chat', icon: 'fa-brands fa-whatsapp', defaultMethod: 'WhatsApp' },
 { id: 'Phone', label: 'Direct Phone Call', icon: 'fa-solid fa-phone', defaultMethod: 'Phone' },
 { id: 'In-Person', label: 'In-Person Meeting', icon: 'fa-solid fa-handshake', defaultMethod: 'Other' },
 { id: 'Email', label: 'Email Follow-up', icon: 'fa-solid fa-envelope', defaultMethod: 'Email' },
 { id: 'Other', label: 'Other', icon: 'fa-solid fa-calendar-check', defaultMethod: 'Other' }
];

export function getPlatformInfo(platform: string) {
 const found = MEETING_PLATFORMS.find(p => p.id.toLowerCase() === (platform || '').toLowerCase() || p.label.toLowerCase() === (platform || '').toLowerCase());
 if (found) return found;
 if (platform === 'WhatsApp') return { id: 'WhatsApp', label: 'WhatsApp', icon: 'fa-brands fa-whatsapp' };
 if (platform === 'Phone') return { id: 'Phone', label: 'Phone Call', icon: 'fa-solid fa-phone' };
 if (platform === 'Email') return { id: 'Email', label: 'Email', icon: 'fa-solid fa-envelope' };
 return { id: platform || 'Meeting', label: platform || 'Meeting', icon: 'fa-solid fa-calendar-check' };
}

export function parseFollowUp(f: Row) {
 const rawAction = f.next_action || '';
 const match = rawAction.match(/^\[(.*?)\]\s*(.*)$/);
 const platform = match ? match[1] : (f.method || 'Follow-up');
 const action = match ? match[2] : (rawAction || 'Scheduled follow-up');

 const notesText = f.notes || '';
 const urlMatch = notesText.match(/(https?:\/\/[^\s]+)/);
 const meetingUrl = urlMatch ? urlMatch[1] : null;

 const sourceMatch = notesText.match(/Source:\s*([^\n\r]+)/i);
 const meetingSource = sourceMatch ? sourceMatch[1].trim() : (f.leads?.source || null);

 return {
  platform,
  action,
  meetingUrl,
  meetingSource,
  notes: notesText
 };
}

export function formatGoogleCalendarUrl({
 title,
 start,
 durationMinutes = 30,
 details = '',
 location = ''
}: {
 title: string;
 start: Date | string;
 durationMinutes?: number;
 details?: string;
 location?: string;
}) {
 const startDate = new Date(start);
 const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
 const toGCalString = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
 const datesParam = `${toGCalString(startDate)}/${toGCalString(endDate)}`;

 const params = new URLSearchParams({
  action: 'TEMPLATE',
  text: title,
  dates: datesParam,
  details: details,
  location: location
 });

 return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadIcsFile({
 title,
 start,
 durationMinutes = 30,
 details = '',
 location = ''
}: {
 title: string;
 start: Date | string;
 durationMinutes?: number;
 details?: string;
 location?: string;
}) {
 const startDate = new Date(start);
 const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
 const toIcsString = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

 const icsContent = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//EliteInfotec CRM//EN',
  'CALSCALE:GREGORIAN',
  'BEGIN:VEVENT',
  `UID:${Date.now()}@eliteinfotec.in`,
  `DTSTAMP:${toIcsString(new Date())}`,
  `DTSTART:${toIcsString(startDate)}`,
  `DTEND:${toIcsString(endDate)}`,
  `SUMMARY:${title.replace(/\n/g, ' ')}`,
  `DESCRIPTION:${details.replace(/\n/g, '\\n')}`,
  `LOCATION:${location.replace(/\n/g, ' ')}`,
  'STATUS:CONFIRMED',
  'END:VEVENT',
  'END:VCALENDAR'
 ].join('\r\n');

 const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.setAttribute('download', `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.ics`);
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 URL.revokeObjectURL(url);
}

function AddToCalendarButtons({
 f,
 leadName
}: {
 f: Row;
 leadName?: string;
}) {
 const parsed = parseFollowUp(f);
 const company = leadName || f.leads?.company_name || 'Client';
 const eventTitle = `Meeting with ${company} (${parsed.platform})`;
 const details = [
  `Meeting Platform: ${parsed.platform}`,
  parsed.meetingSource ? `Meeting Source: ${parsed.meetingSource}` : '',
  `Agenda: ${parsed.action}`,
  `Lead / Client: ${company}`,
  parsed.notes ? `Notes:\n${parsed.notes}` : ''
 ].filter(Boolean).join('\n');
 const location = parsed.meetingUrl || parsed.platform;

 const gcalUrl = formatGoogleCalendarUrl({
  title: eventTitle,
  start: f.due_at,
  details,
  location
 });

 return (
  <div className="add-to-calendar-btn-group">
   {parsed.meetingUrl && (
    <a href={parsed.meetingUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-join-meeting" title="Join Meeting">
     <i className="fa-solid fa-video"></i> Join
    </a>
   )}
   <a href={gcalUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-cal-gcal" title="Add to Google Calendar">
    <i className="fa-brands fa-google"></i> Add to Calendar
   </a>
   <button
    type="button"
    className="btn btn-sm btn-cal-ics"
    onClick={() => downloadIcsFile({ title: eventTitle, start: f.due_at, details, location })}
    title="Download .ics for Outlook / Apple Calendar"
   >
    <i className="fa-solid fa-calendar-arrow-down"></i> .ics
   </button>
  </div>
 );
}

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
  [quickAdd,setQuickAdd]=useState(false),
  [mobileMenuOpen,setMobileMenuOpen]=useState(false);

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
  const[l,f]=await Promise.all([fetchAll('leads'),fetchAll('follow_ups','*, leads(company_name, source, contact_person)',b=>b.is('completed_at',null))]);
  setLeads(l);setFups(f.sort((a,b)=>+new Date(a.due_at)-+new Date(b.due_at)));
 }catch(x:any){say('Could not load data: '+x.message,true);}setLoading(false);},[]);

 useEffect(()=>{reload();},[reload]);
 const due=fups.filter(f=>bucket(f)!=='upcoming').length,over=fups.filter(f=>bucket(f)==='overdue').length;
 useEffect(()=>{document.title=(due?`(${due}) `:'')+'EliteInfotec CRM';},[due]);

 const nav=(p:string)=>{setPage(p);setOpen(null);setMobileMenuOpen(false);};
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
   {mobileMenuOpen && (
    <div className="side-backdrop" onClick={()=>setMobileMenuOpen(false)}/>
   )}

   <nav className={`side ${mobileMenuOpen?'mobile-open':''}`}>
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
      <button className="mobile-menu-btn" onClick={()=>setMobileMenuOpen(true)} title="Open navigation">
       <i className="fa-solid fa-bars"></i>
      </button>
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
       <span className="live-clock-text">{liveClock || '12h Clock'}</span>
      </div>

      <button className="btn btn-primary btn-sm topbar-action-btn" onClick={()=>{nav('All Leads');setQuickAdd(true);}}>
       <i className="fa-solid fa-plus"></i> <span className="topbar-action-label">New Lead</span>
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

   {/* Mobile App Bottom Tab Bar */}
   <nav className="mobile-bottom-bar" aria-label="Mobile Navigation">
    <button
     type="button"
     className={`mobile-tab-btn ${page === 'Dashboard' && !open ? 'active' : ''}`}
     onClick={() => nav('Dashboard')}
    >
     <i className="fa-solid fa-gauge-high"></i>
     <span>Dashboard</span>
    </button>

    <button
     type="button"
     className={`mobile-tab-btn ${page === 'All Leads' && !open ? 'active' : ''}`}
     onClick={() => nav('All Leads')}
    >
     <i className="fa-solid fa-address-book"></i>
     <span>Leads</span>
    </button>

    <button
     type="button"
     className={`mobile-tab-btn ${page === 'Calendar' && !open ? 'active' : ''}`}
     onClick={() => nav('Calendar')}
    >
     <i className="fa-solid fa-calendar-days"></i>
     <span>Calendar</span>
    </button>

    <button
     type="button"
     className={`mobile-tab-btn ${page === 'Follow-ups' && !open ? 'active' : ''}`}
     onClick={() => nav('Follow-ups')}
    >
     <div className="mobile-tab-icon-wrap">
      <i className="fa-solid fa-clock-rotate-left"></i>
      {Boolean(due && due > 0) && <span className="mobile-tab-badge">{due}</span>}
     </div>
     <span>Follow-ups</span>
    </button>

    <button
     type="button"
     className={`mobile-tab-btn ${['Import Data', 'Company Details', 'Settings'].includes(page) && !open ? 'active' : ''}`}
     onClick={() => setMobileMenuOpen(true)}
    >
     <i className="fa-solid fa-bars"></i>
     <span>Menu</span>
    </button>
   </nav>

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
     placeholder="Search..."
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
 const[due,setDue]=useState(''),[platform,setPlatform]=useState('Google Meet'),
  [src,setSrc]=useState(lead?.source || 'LinkedIn'),[customSrc,setCustomSrc]=useState(''),
  [link,setLink]=useState(''),[a,setA]=useState(''),[n,setN]=useState('');

 const save=async()=>{
  if(!due)return say('Please select a date and time',true);
  const finalSource = src === 'Other' ? (customSrc.trim() || 'Other') : src;
  const iso=new Date(due).toISOString();
  const methodDb = ['Email','WhatsApp','Phone','LinkedIn'].includes(platform) ? platform : 'Other';
  const finalNextAction = `[${platform}] ${a.trim() || 'Scheduled meeting'}`;
  const notesArr:string[] = [];
  if (link.trim()) notesArr.push(`Link: ${link.trim()}`);
  if (finalSource.trim()) notesArr.push(`Source: ${finalSource.trim()}`);
  if (n.trim()) notesArr.push(n.trim());
  const finalNotes = notesArr.length ? notesArr.join('\n') : null;

  const{error}=await supabase.from('follow_ups').insert({
   lead_id:lead.id,
   due_at:iso,
   method:methodDb,
   next_action:finalNextAction,
   notes:finalNotes
  });
  if(error)return say(error.message,true);

  if (lead.id && finalSource && (!lead.source || lead.source === 'Other')) {
   await supabase.from('leads').update({source: finalSource}).eq('id', lead.id);
  }

  await logAct(lead.id,'Follow-up scheduled',`${platform} meeting on ${fmt(iso)} (Source: ${finalSource})`,[finalNextAction,link].filter(Boolean).join(' — '));
  setDue('');setA('');setN('');setLink('');
  say(`Meeting scheduled via ${platform} (Source: ${finalSource})!`);
  done();
 };

 return<div className="schedule-box">
  <div className="schedule-header">
   <i className="fa-solid fa-calendar-plus"></i> Set Follow-up / Meeting Reminder
  </div>
  
  <div className="schedule-form-grid">
   <div>
    <label className="field-label-sm"><i className="fa-regular fa-calendar"></i> Date & Time (12h format)</label>
    <input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/>
   </div>

   <div>
    <label className="field-label-sm"><i className="fa-solid fa-share-nodes text-teal"></i> Meeting Source</label>
    <select value={src} onChange={e=>setSrc(e.target.value)}>
     {MEETING_SOURCES.map(s=>(
      <option key={s} value={s}>{s}</option>
     ))}
    </select>
   </div>

   {src==='Other' && (
    <div>
     <label className="field-label-sm"><i className="fa-solid fa-pen"></i> Custom Meeting Source</label>
     <input
      placeholder="Specify meeting source..."
      value={customSrc}
      onChange={e=>setCustomSrc(e.target.value)}
     />
    </div>
   )}

   <div>
    <label className="field-label-sm"><i className="fa-solid fa-video"></i> Meeting Platform</label>
    <select value={platform} onChange={e=>setPlatform(e.target.value)}>
     {MEETING_PLATFORMS.map(p=>(
      <option key={p.id} value={p.id}>{p.label}</option>
     ))}
    </select>
   </div>
  </div>

  {due&&<div className="hint-12h"><i className="fa-regular fa-clock"></i> 12-Hour Confirmation: <b>{fmt(due)}</b></div>}

  <div className="schedule-form-grid" style={{marginTop: 10}}>
   <div>
    <label className="field-label-sm"><i className="fa-solid fa-link"></i> Meeting Link / Room (Optional)</label>
    <input
     placeholder="e.g. meet.google.com/xyz-abcd-efg or Zoom link"
     value={link}
     onChange={e=>setLink(e.target.value)}
    />
   </div>

   <div>
    <label className="field-label-sm"><i className="fa-solid fa-pen"></i> Meeting Agenda / Action</label>
    <input
     placeholder="e.g. Discuss UI/UX scope & project estimate"
     value={a}
     onChange={e=>setA(e.target.value)}
    />
   </div>
  </div>

  <div style={{marginTop: 10}}>
   <label className="field-label-sm"><i className="fa-solid fa-note-sticky"></i> Additional Internal Notes</label>
   <input
    placeholder="e.g. Client requested portfolio examples for fintech app"
    value={n}
    onChange={e=>setN(e.target.value)}
   />
  </div>

  <div style={{marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 10}}>
   <button className="btn btn-primary" onClick={save}>
    <i className="fa-solid fa-check"></i> {label}
   </button>
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
  <div className="followup-complete-inline">
   <input placeholder="Outcome summary (optional)" value={out} onChange={e=>setOut(e.target.value)}/>
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
    {l.map(f=>{
     const parsed = parseFollowUp(f);
     const info = getPlatformInfo(parsed.platform);
     return (
      <div className="card followup-item-card" key={f.id}>
       <div className="followup-card-top">
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
         <a href="#" onClick={e=>{e.preventDefault();openLead(f.lead_id)}} className="followup-lead-link">
          <i className="fa-solid fa-building"></i> <b>{f.leads?.company_name}</b>
         </a>
         <span className={`platform-badge platform-${parsed.platform.toLowerCase().replace(/\s+/g,'-')}`}>
          <i className={info.icon}></i> {parsed.platform}
         </span>
         {parsed.meetingSource && (
          <span className="meeting-source-pill" title={`Meeting Source: ${parsed.meetingSource}`}>
           <i className="fa-solid fa-share-nodes"></i> {parsed.meetingSource}
          </span>
         )}
        </div>
        <span className={`followup-due-tag ${k==='overdue'?'tag-overdue':''}`}>
         <i className="fa-regular fa-clock"></i> {fmt(f.due_at)}
        </span>
       </div>

       <div className="followup-action-line">
        <span className="followup-action-text">{parsed.action}</span>
        {parsed.notes&&<span className="followup-notes-text"> — {parsed.notes}</span>}
       </div>

       <div className="followup-actions-single-row">
        <Complete f={f} say={say} done={async()=>{await reload();}}/>
        <button className="btn btn-secondary btn-sm" onClick={()=>setNext(next?.id===f.id?null:f)}>
         <i className="fa-solid fa-calendar-plus"></i> Schedule Next
        </button>
        <AddToCalendarButtons f={f} leadName={f.leads?.company_name}/>
       </div>
       {next?.id===f.id&&<div style={{marginTop:14}}>
        <Schedule lead={{id:f.lead_id}} say={say} label="Save Follow-up" done={async()=>{setNext(null);await reload();}}/>
       </div>}
      </div>
     );
    })}
    {!l.length&&<p className="mut empty-followup-text"><i className="fa-regular fa-circle-check"></i> No items in this section.</p>}
   </div>
  </div>;
 };

 return<>
  <div className="page-header">
   <div>
    <h2><i className="fa-solid fa-clock-rotate-left text-teal"></i> Follow-up Pipeline</h2>
    <p className="page-subtitle">Track timely follow-ups across Google Meet, Zoom, WhatsApp, calls, and email.</p>
   </div>
  </div>
  {grp('overdue','Overdue Follow-ups','fa-solid fa-triangle-exclamation text-rose')}
  {grp('today','Due Today','fa-solid fa-bell text-amber')}
  {grp('upcoming','Upcoming Scheduled','fa-solid fa-calendar-days text-indigo')}
 </>;
}

function CalendarAddSchedule({
 leads,
 say,
 done,
 onCancel
}:{
 leads: Row[];
 say: Say;
 done: () => Promise<void> | void;
 onCancel: () => void;
}) {
 const [isNewLead, setIsNewLead] = useState(false);
 const [selectedLeadId, setSelectedLeadId] = useState(leads[0]?.id || '');
 const [newCompanyName, setNewCompanyName] = useState('');
 const [newContactPerson, setNewContactPerson] = useState('');

 const [due, setDue] = useState('');
 const [platform, setPlatform] = useState('Google Meet');
 const [src, setSrc] = useState('LinkedIn');
 const [customSrc, setCustomSrc] = useState('');
 const [link, setLink] = useState('');
 const [agenda, setAgenda] = useState('');
 const [notes, setNotes] = useState('');
 const [busy, setBusy] = useState(false);

 const handleLeadChange = (id: string) => {
  setSelectedLeadId(id);
  const chosen = leads.find(l => l.id === id);
  if (chosen?.source) {
   if (MEETING_SOURCES.includes(chosen.source)) {
    setSrc(chosen.source);
    setCustomSrc('');
   } else {
    setSrc('Other');
    setCustomSrc(chosen.source);
   }
  }
 };

 const save = async () => {
  if (!due) return say('Please select a meeting date and time', true);
  let targetLeadId = selectedLeadId;
  const finalSource = src === 'Other' ? (customSrc.trim() || 'Other') : src;

  setBusy(true);

  try {
   if (isNewLead) {
    if (!newCompanyName.trim()) {
     setBusy(false);
     return say('Please enter a company or prospect name', true);
    }
    const { data: leadData, error: leadErr } = await supabase.from('leads').insert({
     company_name: newCompanyName.trim(),
     contact_person: newContactPerson.trim() || null,
     source: finalSource,
     status: 'To Contact',
     rating: 'Warm'
    }).select('id, company_name').single();

    if (leadErr) {
     setBusy(false);
     return say('Could not create lead: ' + leadErr.message, true);
    }
    targetLeadId = leadData.id;
    await logAct(targetLeadId, 'Note', `Lead created while scheduling meeting (Source: ${finalSource})`);
   } else {
    if (!targetLeadId) {
     setBusy(false);
     return say('Please select a lead for this meeting', true);
    }
   }

   const iso = new Date(due).toISOString();
   const methodDb = ['Email', 'WhatsApp', 'Phone', 'LinkedIn'].includes(platform) ? platform : 'Other';
   const finalNextAction = `[${platform}] ${agenda.trim() || 'Scheduled meeting'}`;
   const notesArr: string[] = [];
   if (link.trim()) notesArr.push(`Link: ${link.trim()}`);
   if (finalSource.trim()) notesArr.push(`Source: ${finalSource.trim()}`);
   if (notes.trim()) notesArr.push(notes.trim());
   const finalNotes = notesArr.length ? notesArr.join('\n') : null;

   const { error: fupErr } = await supabase.from('follow_ups').insert({
    lead_id: targetLeadId,
    due_at: iso,
    method: methodDb,
    next_action: finalNextAction,
    notes: finalNotes
   });

   if (fupErr) {
    setBusy(false);
    return say('Could not save schedule: ' + fupErr.message, true);
   }

   if (targetLeadId && finalSource && (!leads.find(l => l.id === targetLeadId)?.source || leads.find(l => l.id === targetLeadId)?.source === 'Other')) {
    await supabase.from('leads').update({ source: finalSource }).eq('id', targetLeadId);
   }

   await logAct(targetLeadId, 'Follow-up scheduled', `${platform} meeting on ${fmt(iso)} (Source: ${finalSource})`, [finalNextAction, link].filter(Boolean).join(' — '));

   say(`Meeting scheduled via ${platform} (Source: ${finalSource})!`);
   setBusy(false);
   await done();
  } catch (err: any) {
   setBusy(false);
   say('Error: ' + err.message, true);
  }
 };

 return (
  <div className="card schedule-creator-card">
   <div className="schedule-creator-header">
    <div className="schedule-creator-title">
     <div className="schedule-creator-icon">
      <i className="fa-solid fa-calendar-plus"></i>
     </div>
     <div>
      <h3>Add Calendar Schedule</h3>
      <p>Manually schedule a meeting, call, or follow-up with meeting source tracking and 1-click calendar sync.</p>
     </div>
    </div>
   </div>

   <div className="schedule-lead-mode-toggle">
    <button
     type="button"
     className={`schedule-mode-btn ${!isNewLead ? 'active' : ''}`}
     onClick={() => setIsNewLead(false)}
    >
     <i className="fa-solid fa-address-book"></i> Existing Lead ({leads.length})
    </button>
    <button
     type="button"
     className={`schedule-mode-btn ${isNewLead ? 'active' : ''}`}
     onClick={() => setIsNewLead(true)}
    >
     <i className="fa-solid fa-plus"></i> New Prospect / Client
    </button>
   </div>

   {!isNewLead ? (
    <div style={{ marginBottom: 14 }}>
     <label className="field-label-sm"><i className="fa-solid fa-building"></i> Select Lead / Client *</label>
     <select
      value={selectedLeadId}
      onChange={e => handleLeadChange(e.target.value)}
      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff' }}
     >
      {leads.length === 0 && <option value="">No leads in database</option>}
      {leads.map(l => (
       <option key={l.id} value={l.id}>
        {l.company_name} {l.contact_person ? `(${l.contact_person})` : ''} {l.source ? `— [Source: ${l.source}]` : ''}
       </option>
      ))}
     </select>
    </div>
   ) : (
    <div className="schedule-form-grid" style={{ marginBottom: 14 }}>
     <div>
      <label className="field-label-sm"><i className="fa-solid fa-building"></i> Company / Client Name *</label>
      <input
       placeholder="e.g. Acme Innovations or John Client"
       value={newCompanyName}
       onChange={e => setNewCompanyName(e.target.value)}
      />
     </div>
     <div>
      <label className="field-label-sm"><i className="fa-solid fa-user"></i> Contact Person (Optional)</label>
      <input
       placeholder="e.g. John Doe"
       value={newContactPerson}
       onChange={e => setNewContactPerson(e.target.value)}
      />
     </div>
    </div>
   )}

   <div className="schedule-form-grid">
    <div>
     <label className="field-label-sm">
      <i className="fa-solid fa-share-nodes text-teal"></i> Meeting Source *
     </label>
     <select value={src} onChange={e => setSrc(e.target.value)}>
      {MEETING_SOURCES.map(s => (
       <option key={s} value={s}>{s}</option>
      ))}
     </select>
    </div>

    {src === 'Other' && (
     <div>
      <label className="field-label-sm"><i className="fa-solid fa-pen"></i> Custom Meeting Source *</label>
      <input
       placeholder="e.g. Upwork, Twitter, Inbound Call..."
       value={customSrc}
       onChange={e => setCustomSrc(e.target.value)}
      />
     </div>
    )}

    <div>
     <label className="field-label-sm"><i className="fa-solid fa-video text-teal"></i> Meeting Platform</label>
     <select value={platform} onChange={e => setPlatform(e.target.value)}>
      {MEETING_PLATFORMS.map(p => (
       <option key={p.id} value={p.id}>{p.label}</option>
      ))}
     </select>
    </div>

    <div>
     <label className="field-label-sm"><i className="fa-regular fa-calendar text-teal"></i> Date & Time (12h format) *</label>
     <input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} />
    </div>
   </div>

   {due && (
    <div className="hint-12h" style={{ marginTop: 10 }}>
     <i className="fa-regular fa-clock"></i> 12-Hour Confirmation: <b>{fmt(due)}</b>
    </div>
   )}

   <div className="schedule-form-grid" style={{ marginTop: 12 }}>
    <div>
     <label className="field-label-sm"><i className="fa-solid fa-link"></i> Meeting Link / Room (Optional)</label>
     <input
      placeholder="e.g. meet.google.com/xyz-abcd-efg or Zoom link"
      value={link}
      onChange={e => setLink(e.target.value)}
     />
    </div>

    <div>
     <label className="field-label-sm"><i className="fa-solid fa-pen"></i> Meeting Agenda / Action</label>
     <input
      placeholder="e.g. Discuss UI/UX scope & project estimate"
      value={agenda}
      onChange={e => setAgenda(e.target.value)}
     />
    </div>
   </div>

   <div style={{ marginTop: 12 }}>
    <label className="field-label-sm"><i className="fa-solid fa-note-sticky"></i> Internal Notes & Context (Optional)</label>
    <input
     placeholder="e.g. Client requested portfolio examples, budget discussion..."
     value={notes}
     onChange={e => setNotes(e.target.value)}
    />
   </div>

   <div className="schedule-form-actions-row">
    <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
     Cancel
    </button>
    <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
     {busy ? (
      <><i className="fa-solid fa-spinner fa-spin"></i> Saving…</>
     ) : (
      <><i className="fa-solid fa-calendar-check"></i> Save & Add to Calendar</>
     )}
    </button>
   </div>
  </div>
 );
}

function Calendar({leads,fups,reload,say,openLead}:P){
 const [adding, setAdding] = useState(false);
 const days=new Map<string,Row[]>();
 fups.forEach(f=>{
  const k=new Date(f.due_at).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
  days.set(k,[...(days.get(k)||[]),f]);
 });

 return<>
  <div className="page-header">
   <div>
    <h2><i className="fa-solid fa-calendar-days text-teal"></i> Follow-up & Meeting Calendar</h2>
    <p className="page-subtitle">Upcoming calls, video meetings, and follow-ups with 1-click Google Calendar & .ics sync.</p>
   </div>
   <div className="header-actions">
    {!adding && (
     <button className="btn btn-primary" onClick={()=>setAdding(true)}>
      <i className="fa-solid fa-calendar-plus"></i> Add Calendar Schedule
     </button>
    )}
   </div>
  </div>

  {adding && (
   <div style={{marginBottom: 20}}>
    <CalendarAddSchedule
     leads={leads}
     say={say}
     done={async () => {
      setAdding(false);
      await reload();
     }}
     onCancel={() => setAdding(false)}
    />
   </div>
  )}

  <div className="calendar-grid">
   {[...days].map(([d,l])=><div className="card calendar-day-card" key={d}>
    <div className="calendar-day-header">
     <div className="calendar-day-title">
      <i className="fa-regular fa-calendar"></i> {d}
     </div>
     <span className="calendar-count-badge">{l.length} meeting{l.length>1?'s':''}</span>
    </div>
    <div className="calendar-items-list">
     {l.map(f=>{
      const parsed = parseFollowUp(f);
      const info = getPlatformInfo(parsed.platform);
      return (
       <div key={f.id} className="calendar-item-row">
        <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',flex:1}}>
         <span className="calendar-time-pill">
          <i className="fa-regular fa-clock"></i> {fmtTime(f.due_at)}
         </span>
         <span className={`platform-badge platform-${parsed.platform.toLowerCase().replace(/\s+/g,'-')}`}>
          <i className={info.icon}></i> {parsed.platform}
         </span>
         {parsed.meetingSource && (
          <span className="meeting-source-pill" title={`Meeting Source: ${parsed.meetingSource}`}>
           <i className="fa-solid fa-share-nodes"></i> {parsed.meetingSource}
          </span>
         )}
         <a href="#" onClick={e=>{e.preventDefault();openLead(f.lead_id)}} className="calendar-lead-link">
          <i className="fa-solid fa-building"></i> {f.leads?.company_name}
         </a>
         <span className="calendar-action-note">{parsed.action}</span>
        </div>
        <AddToCalendarButtons f={f} leadName={f.leads?.company_name}/>
       </div>
      );
     })}
    </div>
   </div>)}
  </div>
  {!days.size&&<div className="card empty-state-card">
    <i className="fa-regular fa-calendar-check empty-state-icon"></i>
    <h3>No Pending Follow-ups</h3>
    <p className="mut">Your calendar is clear. Schedule follow-ups or meetings manually or from any lead profile.</p>
    <div style={{marginTop: 16}}>
     <button className="btn btn-primary" onClick={()=>setAdding(true)}>
      <i className="fa-solid fa-calendar-plus"></i> Add Calendar Schedule
     </button>
    </div>
   </div>}
  </>;
 }

function LeadDetail({lead,reload,say,back,fups}:P&{lead:Row,back:()=>void}){
 const[acts,setActs]=useState<Row[]>([]),[edit,setEdit]=useState(false);
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
     <ActivityTimeline
      leadId={lead.id}
      lead={lead}
      acts={acts}
      onRefresh={refresh}
      say={say}
      fmt={fmt}
     />
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
      {mine.map(f=>{
       const parsed = parseFollowUp(f);
       const info = getPlatformInfo(parsed.platform);
       return (
        <div key={f.id} className="lead-followup-item">
         <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:6}}>
          <div className="lead-followup-time"><i className="fa-regular fa-clock"></i> {fmt(f.due_at)}</div>
          <span className={`platform-badge platform-${parsed.platform.toLowerCase().replace(/\s+/g,'-')}`}>
           <i className={info.icon}></i> {parsed.platform}
          </span>
          {parsed.meetingSource && (
           <span className="meeting-source-pill" title={`Meeting Source: ${parsed.meetingSource}`}>
            <i className="fa-solid fa-share-nodes"></i> {parsed.meetingSource}
           </span>
          )}

         </div>
         <div className="lead-followup-action" style={{marginTop: 6}}>{parsed.action}</div>
         <div className="followup-actions-single-row" style={{marginTop: 10}}>
          <Complete f={f} say={say} done={refresh}/>
          <AddToCalendarButtons f={f} leadName={lead.company_name}/>
         </div>
        </div>
       );
      })}
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
  if(/\.xlsx?$/i.test(f.name)){
   const reader=new FileReader();
   reader.onload=(e)=>{
    try{
     const data=new Uint8Array(e.target?.result as ArrayBuffer);
     const workbook=XLSX.read(data,{type:'array'});
     const firstSheetName=workbook.SheetNames[0];
     const worksheet=workbook.Sheets[firstSheetName];
     const json=XLSX.utils.sheet_to_json<Row>(worksheet,{defval:''});
     if(!json.length)return say('No rows found in this Excel sheet',true);
     const fields=Object.keys(json[0]||{});
     setRows(json);setMap(autoMap(fields));
     say(`Loaded ${json.length} rows from Excel spreadsheet!`);
    }catch(err:any){
     say('Failed to read Excel file: '+err.message,true);
    }
   };
   reader.readAsArrayBuffer(f);
   return;
  }
  Papa.parse<Row>(f,{header:true,skipEmptyLines:true,complete:r=>{
   if(!r.meta.fields?.length)return say('No header row found in this CSV',true);
   setRows(r.data);setMap(autoMap(r.meta.fields));
   say(`Loaded ${r.data.length} rows from CSV!`);
  },error:e=>say(e.message,true)});
 };

 const templateExcel=()=>{
  const a=document.createElement('a');
  a.href='/elite_leads_template_with_dropdowns.xlsx';
  a.download='elite_leads_template_with_dropdowns.xlsx';
  a.click();
 };

 const templateCsv=()=>{
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([Papa.unparse({
   fields:FIELDS.map(f=>f.label),
   data:[
     ['NexGen Retail Solutions','Rajesh Sharma','Chief Technology Officer','rajesh@nexgenretail.com','+91 98765 43210','https://nexgenretail.com','https://linkedin.com/in/rajesh-sharma','India','E-commerce','LinkedIn','Hot','Interested','Shopify','Expanding D2C brand needing custom Shopify store and ERP integration','Met on LinkedIn; budget approved for Q4'],
     ['Apex Health Systems','Sarah Jenkins','Head of Digital Products','s.jenkins@apexhealth.co.uk','+44 20 7946 0912','https://apexhealth.co.uk','https://linkedin.com/in/sarah-jenkins','United Kingdom','Healthcare','Referral','Warm','To Contact','Mobile App','Looking for cross-platform Flutter/React Native patient app','Referred by Dr. Watson; follow up next Tuesday'],
     ['Starlight Media Group','Michael Vance','Marketing Director','michael@starlightmedia.com','+1 (415) 555-0198','https://starlightmedia.com','https://linkedin.com/in/michael-vance','United States','Media & Marketing','Website Inquiry','Hot','Proposal Sent','Web Development','Needs complete web portal redesign with high SEO performance','Proposal submitted yesterday; awaiting feedback'],
     ['Solaria Tech','Priya Patel','Founder & CEO','priya@solaria.tech','+91 91234 56789','https://solaria.tech','https://linkedin.com/in/priya-patel','India','SaaS','Cold Email','Cold','New','AI Automation','Early-stage startup interested in automated CRM workflows','Outreached via cold email; awaiting first response'],
     ['Urban Living Furniture','David Miller','Managing Director','david@urbanliving.com.au','+61 2 9876 5432','https://urbanliving.com.au','https://linkedin.com/in/david-miller','Australia','Furniture & Decor','Google Search','Warm','Contacted','WordPress','Wants to migrate legacy site to high-speed WooCommerce','Scheduled demo call']
   ]
  })],{type:'text/csv'}));
  a.download='elite-leads-sample.csv';a.click();
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
    <p className="page-subtitle">Upload CSV or Excel spreadsheets from LinkedIn, Apollo, scrapers, or spreadsheets.</p>
   </div>
   <div className="header-actions" style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
    <button className="btn btn-primary" onClick={templateExcel} title="Download Excel Template with in-cell dropdowns for Countries, Statuses, Ratings, etc.">
     <i className="fa-solid fa-file-excel"></i> Download Excel Template (with Dropdowns)
    </button>
    <button className="btn btn-secondary" onClick={templateCsv} title="Download CSV sample file">
     <i className="fa-solid fa-file-csv"></i> Download Sample CSV
    </button>
   </div>
  </div>

  <div className="card import-drop-card">
   <div className="import-icon-circle"><i className="fa-solid fa-cloud-arrow-up"></i></div>
   <h3>Upload CSV or Excel Spreadsheet</h3>
   <p className="mut">Select a <b>.csv</b> or <b>.xlsx</b> spreadsheet containing your leads. You can map every column to CRM fields before saving.</p>
   <div className="file-input-wrapper">
    <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={e=>onFile(e.target.files?.[0])} id="csv-upload-input"/>
   </div>
   {file && (
    <div className="selected-file-badge">
     <i className={`fa-solid ${/\.xlsx?$/i.test(file) ? 'fa-file-excel text-emerald' : 'fa-file-csv text-teal'}`}></i> Loaded: <b>{file}</b> ({rows.length} rows)
    </div>
   )}
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
