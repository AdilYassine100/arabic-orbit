// Arabic Orbit — builds one static page per language from src/template.html + content/*.json
// Usage: npm run build   (output in dist/)
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');

function readJSON(f){
  try{return JSON.parse(fs.readFileSync(path.join('content',f),'utf8'));}
  catch(e){console.error(`\n✖ Error in content/${f}: ${e.message}\n`);process.exit(1);}
}
const settings=readJSON('settings.json'),seo=readJSON('seo.json');
const data={settings,stories:readJSON('stories.json'),videos:readJSON('videos.json'),books:readJSON('books.json')};
// API inbox: every content/inbox/*.json file adds one story or one video (used by external tools via the GitHub API)
const inboxDir=path.join('content','inbox');
if(fs.existsSync(inboxDir)){
  for(const f of fs.readdirSync(inboxDir).filter(f=>f.endsWith('.json')).sort()){
    const it=readJSON('inbox/'+f);
    if(it.type==='story'){const {type,...s}=it;data.stories.push(s);}
    else if(it.type==='video'){const {type,lang,...v}=it;const k=lang||'en';(data.videos[k]=data.videos[k]||[]).push(v);}
    else console.warn('! content/inbox/'+f+': "type" must be "story" or "video" — skipped');
  }
}
// Scheduled publishing: hide drafts and items whose publish_date is in the future
const NOW=new Date();
const live=x=>x&&!x.draft&&(!x.publish_date||new Date(x.publish_date)<=NOW);
data.stories=(data.stories||[]).filter(live);
for(const k in data.videos)data.videos[k]=(data.videos[k]||[]).filter(live);
const DOMAIN=(settings.domain||'https://arabicorbit.com/').replace(/\/?$/,'/');
const langs=Object.keys(seo);
const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
const url=l=>DOMAIN+(l==='en'?'':l+'/');

let tpl=fs.readFileSync('src/template.html','utf8')
  .replace(/{{PRICE}}/g,esc(settings.price))
  .replace(/{{FACEBOOK}}/g,esc(settings.facebook)).replace(/{{YOUTUBE}}/g,esc(settings.youtube))
  .replace(/{{PINTEREST}}/g,esc(settings.pinterest)).replace(/{{SHOP}}/g,esc(settings.shop))
  .replace(settings.email?/<!--\/?EMAIL-->/g:/<!--EMAIL-->[\s\S]*?<!--\/EMAIL-->/g,'').replace(/{{EMAIL}}/g,esc(settings.email))
  ;
const cut=tpl.indexOf('</style>')+8;
let headT=tpl.slice(0,cut).replace(/<title>.*?<\/title>\n?/,'').replace(/<meta name="description"[^>]*>\n?/,'').replace(/<meta name="claude:viewport-fit-sides"[^>]*>\n?/,'');
const bodyT=tpl.slice(cut);

// YouTube auto-publishing: new videos from the channel whose title ends with "| Lesson 7", "| Leçon 7", "| Lección 7"…
// are added to that language in content/videos.json (the GitHub workflow saves the file). Each video is added only once:
// if you delete it in the control panel it does not come back (its id stays in content/youtube-seen.json).
const YT_WORDS={en:/^lessons?(?=[\s\d]|$)/i,fr:/^le[çc]ons?(?=[\s\d]|$)/i,es:/^(lecci[oó]n|lecciones|clase)(?=[\s\d]|$)/i,
  pt:/^(aula|li[çc][ãa]o|li[çc][õo]es)(?=[\s\d]|$)/i,it:/^lezion[ei](?=[\s\d]|$)/i,de:/^lektion(en)?(?=[\s\d]|$)/i,
  nl:/^(les|lessen)(?=[\s\d]|$)/i,tr:/^ders(ler)?(?=[\s\d]|$)/i,ru:/^урок/i,id:/^pelajaran(?=[\s\d]|$)/i,zh:/^(第|课)/};
const ytId=u=>(String(u||'').match(/(?:v=|shorts\/|youtu\.be\/|embed\/)([\w-]{11})/)||[])[1];
async function youtubeAuto(){
  const id=String(settings.youtube_channel_id||'').trim();
  if(!id||!settings.youtube_auto)return;
  let xml;
  try{
    if(process.env.YT_FEED_FILE)xml=fs.readFileSync(process.env.YT_FEED_FILE,'utf8');
    else{const r=await fetch('https://www.youtube.com/feeds/videos.xml?channel_id='+encodeURIComponent(id));if(!r.ok)throw new Error('HTTP '+r.status);xml=await r.text();}
  }catch(e){console.warn('! YouTube feed skipped: '+e.message);return;}
  const dec=s=>s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  const tag=(e,t)=>{const m=e.match(new RegExp('<'+t+'>([\\s\\S]*?)</'+t+'>'));return m?dec(m[1].trim()):'';};
  const seenF=path.join('content','youtube-seen.json');
  const seen=new Set(fs.existsSync(seenF)?JSON.parse(fs.readFileSync(seenF,'utf8')):[]);
  const saved=readJSON('videos.json');
  for(const k in saved)for(const v of saved[k]||[])seen.add(ytId(v.url));
  for(const k in data.videos)for(const v of data.videos[k]||[])seen.add(ytId(v.url));
  const added=[];
  for(const e of (xml.match(/<entry>[\s\S]*?<\/entry>/g)||[]).reverse()){
    const v=tag(e,'yt:videoId');if(!v||seen.has(v))continue;
    const full=tag(e,'title'),i=full.lastIndexOf('|');if(i<0)continue;
    const label=full.slice(i+1).trim(),title=full.slice(0,i).trim();
    const lang=Object.keys(YT_WORDS).find(k=>YT_WORDS[k].test(label));if(!lang||!seo[lang])continue;
    const link=(e.match(/<link rel="alternate" href="([^"]+)"/)||[])[1]||'https://www.youtube.com/watch?v='+v;
    let d=tag(e,'media:description').split('\n').map(s=>s.trim()).find(Boolean)||'';
    if(d.length>140)d=d.slice(0,137).trim()+'…';
    const item={label,title,description:d,url:link,glyph:''};
    (saved[lang]=saved[lang]||[]).push(item);
    (data.videos[lang]=data.videos[lang]||[]).push(item);
    seen.add(v);added.push(lang+': '+full);
  }
  if(added.length){
    fs.writeFileSync(path.join('content','videos.json'),JSON.stringify(saved,null,2)+'\n');
    fs.writeFileSync(seenF,JSON.stringify([...seen].filter(Boolean).sort(),null,2)+'\n');
  }
  console.log('YouTube: '+added.length+' new video(s)'+(added.length?'\n  + '+added.join('\n  + '):''));
}

function rmrf(d){if(fs.existsSync(d))fs.rmSync(d,{recursive:true,force:true});}
function copyDir(a,b){fs.mkdirSync(b,{recursive:true});for(const f of fs.readdirSync(a)){const s=path.join(a,f),t=path.join(b,f);fs.statSync(s).isDirectory()?copyDir(s,t):fs.copyFileSync(s,t);}}

(async()=>{
  await youtubeAuto();
  const DATAJSON=JSON.stringify(data).replace(/</g,'\\u003c');
  rmrf('dist');copyDir('public','dist');
  const sameAs=[settings.facebook,settings.youtube,settings.pinterest].filter(Boolean);
  const b=await chromium.launch();
  for(const l of langs){
    const base=l==='en'?'./':'../';
    const links=langs.map(k=>`<a href="${base}${k==='en'?'index.html':k+'/index.html'}" hreflang="${k}" lang="${k}">${esc(seo[k].language_name)}</a>`).join('');
    const {title,description,locale}=seo[l];
    const meta=`<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="page-lang" content="${l}" data-base="${base}">
<link rel="canonical" href="${url(l)}">
${langs.map(k=>`<link rel="alternate" hreflang="${k}" href="${url(k)}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${url('en')}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Arabic Orbit">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url(l)}">
<meta property="og:image" content="${DOMAIN}og-image.png">
<meta property="og:locale" content="${esc(locale)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="${base}favicon.png">
<link rel="apple-touch-icon" href="${base}apple-touch-icon.png">
<script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"WebSite",name:"Arabic Orbit",url:url(l),inLanguage:l,description,publisher:{"@type":"Organization",name:"Arabic Orbit",logo:DOMAIN+"apple-touch-icon.png",sameAs,...(settings.email?{email:settings.email}:{})}}).replace(/</g,'\\u003c')}</script>
`;
    const head=`<!doctype html><html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${meta}${headT}</head>`;
    const p=await b.newPage({viewport:{width:1200,height:900}});
    const errs=[];p.on('pageerror',e=>errs.push(e.message));
    await p.route(/^https?:\/\//,r=>r.abort());
    await p.setContent(`${head}<body>${bodyT.replace('{{DATA}}',()=>DATAJSON).replace('<!--LANGLINKS-->',links)}</body></html>`,{waitUntil:'domcontentloaded'});
    await p.waitForTimeout(150);
    if(errs.length){console.error(`\n✖ Page error (${l}): ${errs.join(' | ')}\n`);process.exit(1);}
    const body=await p.evaluate(()=>{document.querySelectorAll('.playing').forEach(e=>e.classList.remove('playing'));return document.body.innerHTML;});
    const dir=l==='en'?'dist':path.join('dist',l);fs.mkdirSync(dir,{recursive:true});
    const beacon=settings.cf_analytics_token?`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${esc(settings.cf_analytics_token)}"}'></script>`:'';
    fs.writeFileSync(path.join(dir,'index.html'),`${head}<body>${body}${beacon}</body></html>`);
    console.log('✔',l);
    await p.close();
  }
  await b.close();
  const today=new Date().toISOString().slice(0,10);
  fs.writeFileSync('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${langs.map(l=>`  <url><loc>${url(l)}</loc><lastmod>${today}</lastmod>\n${langs.map(k=>`    <xhtml:link rel="alternate" hreflang="${k}" href="${url(k)}"/>`).join('\n')}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${url('en')}"/>\n  </url>`).join('\n')}\n</urlset>\n`);
  fs.writeFileSync('dist/robots.txt',`User-agent: *\nAllow: /\n\nSitemap: ${DOMAIN}sitemap.xml\n`);
  console.log('\nDone: the site is in dist/');
})();
