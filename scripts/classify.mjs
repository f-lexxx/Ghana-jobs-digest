// Turns a raw posting into the fields the site filters on. No dependencies.
const GHANA=/\b(ghana|accra|kumasi|tema|takoradi|tamale|cape coast|sekondi|koforidua|sunyani|ho,\s*ghana|east legon|osu)\b/i;
const OPEN_REGION=/\b(worldwide|world[- ]wide|anywhere|global(ly)?|africa|emea|all countries|any country|international|ghana|west africa)\b/i;
const RESTRICTED=/\b(usa?|u\.s\.a?\.?|united states|america|canada|uk|united kingdom|england|europe|eu|eea|germany|france|spain|portugal|netherlands|ireland|poland|india|latam|latin america|brazil|mexico|apac|asia|australia|new zealand|singapore|japan|middle east|uae|dubai|only|must (reside|be located|live))\b/i;

export function htmlToText(s=''){
  let t=String(s);
  for(let i=0;i<2;i++)t=t.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'");
  return t.replace(/<(script|style)[\s\S]*?<\/\1>/gi,' ').replace(/<br\s*\/?>|<\/(p|li|div|h\d)>/gi,'. ').replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(m,n)=>String.fromCharCode(+n)).replace(/\s+/g,' ').replace(/(\.\s*){2,}/g,'. ').trim();
}

export function workMode({title='',location='',text='',remote=false,workplaceType=''}){
  const wt=String(workplaceType||'').toLowerCase().replace(/[^a-z]/g,'');
  if(wt==='remote')return 'remote';
  if(wt==='hybrid')return 'hybrid';
  if(wt==='onsite'||wt==='office')return 'onsite';
  const head=`${title} ${location}`;
  if(/\bhybrid\b/i.test(head))return 'hybrid';
  if(remote||/\b(remote|work from home|wfh|anywhere)\b/i.test(head))return 'remote';
  if(/\bhybrid\b(?! cloud)/i.test(text.slice(0,2500)))return 'hybrid';
  return 'onsite';
}

export function access({mode,location=''}){
  const loc=String(location||'');
  if(GHANA.test(loc))return 'ghana';
  if(mode==='remote'){
    if(OPEN_REGION.test(loc))return 'remote-open';
    const bare=loc.replace(/\b(fully|100%|remote|work from home|wfh|position|job|only|\(|\)|,|-|–|\/)\b/gi,'').replace(/[\s,\-–()\/]/g,'');
    if(!bare)return 'remote-unspecified';
    return RESTRICTED.test(loc)||bare.length>1?'remote-restricted':'remote-unspecified';
  }
  return 'abroad';
}

const REL_YES=/(relocation\s+(package|assistance|support|allowance|bonus|benefit|budget|stipend|expenses|services|help|program|payment|reimbursement)|paid relocation|relocation\s+(is\s+)?(offered|provided|available|covered|supported)|(offer|provide|cover|pay for|support)s?\s+(your\s+)?(visa|relocation)|(visa|work permit)\s+sponsorship|sponsor(s|ing)?\s+(your\s+|a\s+)?(work\s+)?(visa|permit)|moving\s+(allowance|expenses|costs)|relocat(e|ion)\s+(will be\s+)?(assisted|supported))/i;
const REL_NO=/(no\s+relocation|relocation\s+(assistance|support|package)?\s*(is\s+|are\s+)?(not|unavailable)\b|(do|does|will)\s+not\s+(offer|provide|sponsor|cover)|(can(?:no|')t|cannot|unable to|won't|will not)\s+(offer|provide|sponsor|support)|without\s+relocation|not\s+(able|in a position)\s+to\s+(offer|provide|sponsor)|(no|not)\s+(offering\s+)?(visa\s+)?sponsorship|sponsorship\s+(is\s+)?(not|unavailable)|local candidates only)/i;
const KEYS=/(relocat|visa|sponsor|work permit|moving)/i;
export function relocation(text=''){
  const sentences=String(text).split(/(?<=[.!?])\s+/).filter(s=>KEYS.test(s));
  let yes=null,no=null,visaYes=false,visaNo=false;
  for(const s of sentences){
    const neg=REL_NO.test(s),pos=REL_YES.test(s);
    const isVisa=/visa|sponsor|permit/i.test(s);
    if(neg){no=no||s;if(isVisa)visaNo=true;continue}
    if(pos){yes=yes||s;if(isVisa)visaYes=true}
  }
  const note=(yes||no||'').slice(0,200);
  return{relocation:yes?'offered':no?'not_offered':'unknown',visa:visaYes?'yes':visaNo?'no':null,relocationNote:note};
}

const SCAM=[
  [/(registration|processing|application|training|security|admin(istration)?)\s+fee/i,'asks for a fee'],
  [/(pay|send|deposit)\s+(a\s+)?(small\s+)?(fee|deposit|money)\s+(to|before|for)/i,'asks for payment'],
  [/whats\s?app|telegram|signal\s+me|text\s+\+?\d{6,}/i,'asks to apply via chat app'],
  [/\b[\w.+-]+@(gmail|yahoo|outlook|hotmail|proton(mail)?)\.\w+/i,'free-mail contact address'],
  [/(crypto|bitcoin)\s+(wallet|payment|deposit)/i,'crypto payment'],
  [/earn\s+\$?\d+[\d,]*\s*(per|a|\/)\s*(day|hour)\s+(from home|guaranteed)|no experience (needed|required)[^.]{0,40}\$\d{3,}/i,'too-good-to-be-true pay'],
  [/(buy|purchase)\s+(your own\s+)?(equipment|laptop|software)\s+(from us|through us)/i,'equipment purchase scheme'],
];
export function redFlags(text=''){return SCAM.filter(([re])=>re.test(text)).map(([,why])=>why)}

export function classify(raw){
  const text=raw.text||'';
  const mode=workMode({...raw,text});
  const acc=access({mode,location:raw.location});
  const rel=relocation(text);
  if(raw.visaSponsorFlag===true&&rel.visa!=='no'){rel.visa='yes';if(rel.relocation==='unknown')rel.relocationNote=rel.relocationNote||'Source lists this job as offering visa sponsorship'}
  return{mode,access:acc,...rel,flags:redFlags(`${raw.title||''} ${text}`)};
}
