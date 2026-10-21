export const RATINGS=['Hot','Warm','Cold'], STATUSES=['New','To Contact','Contacted','Interested','Follow-up','Proposal Sent','Won','Lost','Not Interested'],
 SERVICES=['Web Development','Website Design','WordPress','Shopify','SEO','Mobile App','AI Automation','Other'], METHODS=['Email','WhatsApp','Phone','LinkedIn','Other'];
export const FIELDS=[
 {key:'company_name',label:'Company name',al:['company','companyname','organization','organisation','business']},
 {key:'contact_person',label:'Contact person',al:['contact','name','fullname','contactname','person']},
 {key:'job_title',label:'Job title',al:['title','jobtitle','position','designation','role']},
 {key:'email',label:'Email',al:['email','emailaddress','mail','workemail']},
 {key:'phone',label:'Phone',al:['phone','phonenumber','mobile','tel','telephone','whatsapp']},
 {key:'website',label:'Website',al:['website','url','site','web','domain']},
 {key:'linkedin_url',label:'LinkedIn URL',al:['linkedin','linkedinurl','linkedinprofile']},
 {key:'country',label:'Country',al:['country','location']},
 {key:'industry',label:'Industry',al:['industry','sector']},
 {key:'source',label:'Source',al:['source','leadsource']},
 {key:'rating',label:'Rating',al:['rating','temperature']},
 {key:'status',label:'Status',al:['status','stage']},
 {key:'service_interest',label:'Service interest',al:['service','services','interest','serviceinterest']},
 {key:'promising_reason',label:'Why promising',al:['promisingreason','whypromising','reason']},
 {key:'notes',label:'Notes',al:['notes','note','comments','remarks']}];
const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
export const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function autoMap(headers:string[]):Record<string,string>{
 const used=new Set<string>(),m:Record<string,string>={};
 for(const h of headers){const n=norm(h);const f=FIELDS.find(f=>!used.has(f.key)&&(norm(f.key)===n||f.al.includes(n)));m[h]=f?f.key:'';if(f)used.add(f.key);}
 return m;}
const pick=(v:string,list:string[])=>list.find(x=>x.toLowerCase()===v.trim().toLowerCase());
const domain=(w?:string)=>w?w.toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0]:'';
export type Existing={emails:Set<string>,companies:Set<string>};
export type Built={line:number,record:Record<string,string>,errors:string[],warnings:string[],duplicateOf:string|null};
const ckey=(c?:string,w?:string)=>(c||'').toLowerCase().trim()+'|'+domain(w);
export function buildRows(rows:Record<string,string>[],mapping:Record<string,string>,ex:Existing):Built[]{
 const seenE=new Set<string>(),seenC=new Set<string>();
 return rows.map((row,i)=>{
  const r:Record<string,string>={},errors:string[]=[],warnings:string[]=[];let duplicateOf:string|null=null;
  for(const[h,f]of Object.entries(mapping)){const v=(row[h]??'').toString().trim();if(f&&v)r[f]=v;}
  if(!r.company_name)errors.push('Missing company name');
  if(r.email){r.email=r.email.toLowerCase();if(!EMAIL_RE.test(r.email))errors.push('Invalid email: '+r.email);}
  for(const[f,list]of[['rating',RATINGS],['status',STATUSES],['service_interest',SERVICES]] as const){
   if(r[f]){const ok=pick(r[f],list);if(ok)r[f]=ok;else{warnings.push(`Unknown ${f} "${r[f]}" ignored`);delete r[f];}}}
  if(!errors.length){
   if(r.email&&(ex.emails.has(r.email)||seenE.has(r.email)))duplicateOf='same email';
   else if(r.company_name&&(ex.companies.has(ckey(r.company_name,r.website))||seenC.has(ckey(r.company_name,r.website))))duplicateOf='same company and website';
   if(r.email)seenE.add(r.email);seenC.add(ckey(r.company_name,r.website));}
  return{line:i+2,record:r,errors,warnings,duplicateOf};});}
export const existingFrom=(leads:Record<string,any>[]):Existing=>({
 emails:new Set(leads.map(l=>l.email_normalized).filter(Boolean)),companies:new Set(leads.map(l=>ckey(l.company_name,l.website)))});
export const safeCell=(v:any)=>typeof v==='string'&&/^[=+\-@\t\r]/.test(v)?"'"+v:v;
