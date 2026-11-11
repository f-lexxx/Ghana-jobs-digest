#!/usr/bin/env node
// Daily job fetcher. Node 20+, no dependencies.
// Usage: node scripts/fetch-jobs.mjs            (live)
//        FIXTURE_DIR=tests/fixtures node scripts/fetch-jobs.mjs   (offline test)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {classify,htmlToText} from './classify.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CFG=JSON.parse(fs.readFileSync(path.join(ROOT,'scripts/sources.json'),'utf8'));
const OUT=path.join(ROOT,'site/data/jobs.json');
const STATE=path.join(ROOT,'data/state.json');
const FIX=process.env.FIXTURE_DIR?path.resolve(ROOT,process.env.FIXTURE_DIR):null;
const SITE_URL=(process.env.SITE_URL||'').replace(/\/?$/,'/');
const UA='GhanaJobsDigest/1.0 (personal job digest; respects source terms)';
const today=new Date().toISOString().slice(0,10);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function getJson(key,url){
  if(FIX){const f=path.join(FIX,key+'.json');if(!fs.existsSync(f))throw new Error('no fixture '+key);return JSON.parse(fs.readFileSync(f,'utf8'))}
  let err;
  for(let i=0;i<3;i++){
    try{
      const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),30000);
      const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'application/json'},signal:ctl.signal});
      clearTimeout(t);
      if(r.status===404)throw Object.assign(new Error('404 not found'),{final:true});
      if(!r.ok)throw new Error('HTTP '+r.status);
      return await r.json();
    }catch(e){err=e;if(e.final)break;await sleep(1500*(i+1))}
  }
  throw err;
}
const iso=v=>{if(v==null||v==='')return null;let d=typeof v==='number'?new Date(v<1e12?v*1000:v):new Date(String(v).includes(' ')&&!String(v).includes('T')?String(v).replace(' ','T')+'Z':v);return isNaN(d)?null:d.toISOString()};
const pretty=s=>s.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

/* ---------- source adapters: each returns raw jobs ---------- */
const adapters={
  async remotive(){
    const j=await getJson('remotive','https://remotive.com/api/remote-jobs');
    return (j.jobs||[]).map(x=>({sid:x.id,source:'remotive',sourceLabel:'Remotive',trust:'board',title:x.title,company:x.company_name,location:x.candidate_required_location||'',url:x.url,text:htmlToText(x.description),posted:iso(x.publication_date),remote:true,tags:[x.category,x.job_type].filter(Boolean),salary:x.salary||''}));
  },
  async arbeitnow(c){
    const out=[];const visa=new Set();
    for(let p=1;p<=(c.pages||3);p++){
      try{const j=await getJson('arbeitnow-'+p,`https://www.arbeitnow.com/api/job-board-api?page=${p}`);
        for(const x of j.data||[])out.push({sid:x.slug,source:'arbeitnow',sourceLabel:'Arbeitnow',trust:'board',title:x.title,company:x.company_name,location:x.location||'',url:x.url,text:htmlToText(x.description),posted:iso(x.created_at),remote:!!x.remote,tags:[...(x.tags||[]),...(x.job_types||[])],salary:''});
        if(!j.links||!j.links.next)break;}catch(e){if(p===1)throw e;break}
    }
    try{for(let p=1;p<=2;p++){const j=await getJson('arbeitnow-visa-'+p,`https://www.arbeitnow.com/api/job-board-api?visa_sponsorship=true&page=${p}`);for(const x of j.data||[])visa.add(x.slug);if(!j.links||!j.links.next)break}}catch{}
    out.forEach(o=>{if(visa.has(o.sid))o.visaSponsorFlag=true});
    return out;
  },
  async jobicy(c){
    const j=await getJson('jobicy',`https://jobicy.com/api/v2/remote-jobs?count=${c.count||100}`);
    return (j.jobs||[]).map(x=>({sid:x.id,source:'jobicy',sourceLabel:'Jobicy',trust:'board',title:x.jobTitle,company:x.companyName,location:Array.isArray(x.jobGeo)?x.jobGeo.join(', '):(x.jobGeo||''),url:x.url,text:htmlToText(x.jobDescription||x.jobExcerpt),posted:iso(x.pubDate),remote:true,tags:[].concat(x.jobIndustry||[],x.jobType||[]).filter(Boolean),salary:x.salaryMin?`${x.salaryMin}-${x.salaryMax||''} ${x.salaryCurrency||''}/${x.salaryPeriod||''}`:''}));
  }
};
const ats={
  async greenhouse(slug){
    const j=await getJson('gh-'+slug,`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
    return (j.jobs||[]).map(x=>({sid:x.id,source:'greenhouse:'+slug,sourceLabel:pretty(slug)+' careers',trust:'employer',title:x.title,company:x.company_name||pretty(slug),location:(x.location&&x.location.name)||'',url:x.absolute_url,text:htmlToText(x.content),posted:iso(x.first_published||x.updated_at),remote:/remote/i.test((x.location&&x.location.name)||''),tags:(x.departments||[]).map(d=>d.name)}));
  },
  async lever(slug){
    const j=await getJson('lever-'+slug,`https://api.lever.co/v0/postings/${slug}?mode=json`);
    return (Array.isArray(j)?j:[]).map(x=>({sid:x.id,source:'lever:'+slug,sourceLabel:pretty(slug)+' careers',trust:'employer',title:x.text,company:pretty(slug),location:(x.categories&&(x.categories.allLocations||[]).join(', '))||(x.categories&&x.categories.location)||'',url:x.hostedUrl,text:(x.descriptionPlain||htmlToText(x.description||''))+' '+(x.lists||[]).map(l=>htmlToText(l.content)).join(' ')+' '+(x.additionalPlain||''),posted:iso(x.createdAt),workplaceType:x.workplaceType,remote:x.workplaceType==='remote',tags:[x.categories&&x.categories.team,x.categories&&x.categories.commitment].filter(Boolean)}));
  },
  async ashby(slug){
    const j=await getJson('ashby-'+slug,`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
    return (j.jobs||[]).filter(x=>x.isListed!==false).map(x=>({sid:x.id,source:'ashby:'+slug,sourceLabel:pretty(slug)+' careers',trust:'employer',title:x.title,company:pretty(slug),location:x.location||'',url:x.jobUrl||x.applyUrl,text:x.descriptionPlain||htmlToText(x.descriptionHtml||''),posted:iso(x.publishedAt),workplaceType:x.workplaceType,remote:!!x.isRemote,tags:[x.department,x.team,x.employmentType].filter(Boolean)}));
  }
};

/* ---------- run ---------- */
const report=[];let raw=[];
async function run(name,fn){
  try{const r=await fn();raw.push(...r);report.push({name,ok:true,count:r.length})}
  catch(e){report.push({name,ok:false,count:0,error:String(e.message||e).slice(0,160)});console.warn(`! ${name}: ${e.message}`)}
}
for(const [k,c] of Object.entries(CFG.boards))if(c.enabled&&adapters[k])await run(k,()=>adapters[k](c));
for(const [k,list] of Object.entries(CFG.ats))for(const slug of list)if(ats[k]){await run(`${k}:${slug}`,()=>ats[k](slug));if(!FIX)await sleep(400)}

const F=CFG.filters||{};
const inc=(F.include_keywords||[]).map(s=>s.toLowerCase()),exc=(F.exclude_keywords||[]).map(s=>s.toLowerCase());
const cutoff=Date.now()-(F.max_age_days||45)*864e5;
let dropped={flagged:0,old:0,keyword:0,noUrl:0,dupe:0};
const seen=new Map();
for(const r of raw){
  if(!r.url||!r.title){dropped.noUrl++;continue}
  const hay=`${r.title} ${r.company} ${r.tags.join(' ')} ${r.text.slice(0,1500)}`.toLowerCase();
  if(inc.length&&!inc.some(k=>hay.includes(k))){dropped.keyword++;continue}
  if(exc.some(k=>hay.includes(k))){dropped.keyword++;continue}
  if(r.posted&&Date.parse(r.posted)<cutoff){dropped.old++;continue}
  const c=classify(r);
  if(c.flags.length){dropped.flagged++;console.warn(`  flagged "${r.title}" @ ${r.company}: ${c.flags.join('; ')}`);continue}
  const id=crypto.createHash('sha1').update(r.url).digest('hex').slice(0,12);
  const key=`${r.company}|${r.title}|${r.location}`.toLowerCase().replace(/[^a-z0-9|]/g,'');
  const job={id,title:r.title.trim(),company:(r.company||'').trim(),location:(r.location||'').trim(),url:r.url,source:r.source.split(':')[0],sourceLabel:r.sourceLabel,trust:r.trust,posted:r.posted,mode:c.mode,access:c.access,relocation:c.relocation,visa:c.visa,relocationNote:c.relocationNote,snippet:r.text.slice(0,380),salary:r.salary||'',tags:[...new Set(r.tags)].slice(0,5)};
  const prev=seen.get(key);
  if(prev){dropped.dupe++;if(prev.trust==='board'&&job.trust==='employer')seen.set(key,job);continue}
  seen.set(key,job);
}
let jobs=[...seen.values()];

let state={firstSeen:{}};
try{state=JSON.parse(fs.readFileSync(STATE,'utf8'))}catch{}
const fs2=state.firstSeen||{};
for(const j of jobs){if(!fs2[j.id])fs2[j.id]=today;j.firstSeen=fs2[j.id];j.isNew=j.firstSeen===today}
const live=new Set(jobs.map(j=>j.id));
for(const id of Object.keys(fs2))if(!live.has(id)&&Date.parse(fs2[id])<Date.now()-60*864e5)delete fs2[id];
// first-ever run: everything would be "new"; only mark as new what was posted in the last 2 days
if(!Object.keys(state.firstSeen||{}).length||state.bootstrap!==false){
  for(const j of jobs)j.isNew=j.isNew&&(!j.posted||Date.parse(j.posted)>Date.now()-2*864e5);
}
jobs.sort((a,b)=>(b.isNew-a.isNew)||String(b.posted||b.firstSeen).localeCompare(String(a.posted||a.firstSeen)));
jobs=jobs.slice(0,F.max_jobs||3000);

const okSources=report.filter(r=>r.ok).length;
if(!okSources&&!FIX){console.error('Every source failed; keeping the previous jobs.json');process.exit(0)}
const out={generatedAt:new Date().toISOString(),date:today,counts:{total:jobs.length,new:jobs.filter(j=>j.isNew).length,dropped},sources:report,jobs};
fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(out));
fs.mkdirSync(path.dirname(STATE),{recursive:true});fs.writeFileSync(STATE,JSON.stringify({firstSeen:fs2,bootstrap:false,updated:today}));

/* ---------- RSS + morning digest ---------- */
const x=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fresh=jobs.filter(j=>j.isNew).slice(0,60);
const tag=j=>[j.mode,j.access==='ghana'?'Ghana':j.access.startsWith('remote')?'Remote':'Abroad',j.access==='abroad'||j.access==='ghana'?'':'',j.relocation==='offered'?'relocation offered':j.relocation==='not_offered'?'no relocation':'',j.visa==='yes'?'visa sponsorship':''].filter(Boolean).join(' · ');
fs.writeFileSync(path.join(ROOT,'site/feed.xml'),`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Ghana Jobs Digest</title><link>${x(SITE_URL||'./')}</link><description>New verified job postings, updated every morning</description><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${fresh.map(j=>`<item><title>${x(j.title)} — ${x(j.company)}</title><link>${x(j.url)}</link><guid isPermaLink="false">${j.id}</guid><pubDate>${new Date(j.posted||j.firstSeen).toUTCString()}</pubDate><description>${x(`${tag(j)} | ${j.location} | via ${j.sourceLabel}`)}</description></item>`).join('')}</channel></rss>`);
const sect=(h,l)=>l.length?`\n### ${h}\n${l.slice(0,15).map(j=>`- [${j.title} — ${j.company}](${j.url}) · ${j.location||'n/a'} · ${tag(j)} · _${j.sourceLabel}_`).join('\n')}\n`:'';
fs.writeFileSync(path.join(ROOT,'site/digest.md'),`## ${fresh.length} new jobs for ${today}\n${SITE_URL?`Browse and filter: ${SITE_URL}\n`:''}`+
  sect('In Ghana',fresh.filter(j=>j.access==='ghana'))+
  sect('Remote, open to Ghana',fresh.filter(j=>j.access==='remote-open'))+
  sect('Remote, check country eligibility',fresh.filter(j=>j.access==='remote-unspecified'))+
  sect('Abroad with relocation / visa support',fresh.filter(j=>j.access==='abroad'&&(j.relocation==='offered'||j.visa==='yes')))+
  sect('Abroad, relocation not stated',fresh.filter(j=>j.access==='abroad'&&j.relocation==='unknown'&&j.visa!=='yes'))+
  `\n_Sources this morning: ${report.map(r=>`${r.name} ${r.ok?r.count:'FAILED'}`).join(', ')}_\n`);
console.log(`Done: ${jobs.length} jobs (${out.counts.new} new). Sources ok ${okSources}/${report.length}. Dropped`,dropped);
