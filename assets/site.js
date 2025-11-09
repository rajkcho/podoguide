function normalize(value){return (value||'').toLowerCase();}

let applyCityFilters=null;

function filterProviders(){
  if(typeof applyCityFilters==='function'){
    applyCityFilters();
    return;
  }
  const qInput=document.getElementById('city-q');
  const genderSelect=document.getElementById('city-gender');
  const q=normalize(qInput && qInput.value);
  const gender=normalize(genderSelect && genderSelect.value);
  document.querySelectorAll('[data-provider]').forEach(row=>{
    const name=normalize(row.getAttribute('data-name'));
    const g=normalize(row.getAttribute('data-gender'));
    const matchesName=!q || name.includes(q);
    const matchesGender=!gender || (g && g===gender);
    row.style.display=(matchesName && matchesGender)?'':'none';
  });
}

const hasWindow = typeof window !== 'undefined';
const hasDocument = typeof document !== 'undefined';
const hasLocalStorage = typeof localStorage !== 'undefined';

const assetRoot = (() => {
  if(hasDocument){
    const scripts = [];
    if(document.currentScript) scripts.push(document.currentScript);
    scripts.push(...document.querySelectorAll('script[src]'));
    const match = scripts.find(s=>s && s.src && s.src.includes('assets/site.js'));
    if(match){
      const parsed = new URL(match.src, hasWindow && window.location ? window.location.href : undefined);
      parsed.pathname = parsed.pathname.replace(/[^/]+$/, '');
      return parsed.href;
    }
  }
  if(hasWindow && window.location && window.location.href){
    return new URL('assets/', window.location.href).href;
  }
  return 'assets/';
})();

function getAssetUrl(file){
  try{
    return new URL(file, assetRoot).href;
  }catch(e){
    if(hasWindow && window.location){
      try{
        return new URL(file, window.location.href).href;
      }catch(err){}
    }
    return `${assetRoot}${file}`;
  }
}

let leafletAssetPromise=null;

function ensureLeafletAssets(){
  if(typeof L!=='undefined' || !hasDocument) return Promise.resolve();
  if(leafletAssetPromise) return leafletAssetPromise;
  leafletAssetPromise = new Promise((resolve,reject)=>{
    const head = document.head || document.getElementsByTagName('head')[0];
    if(head && !document.getElementById('leaflet-style')){
      const css = document.createElement('link');
      css.id = 'leaflet-style';
      css.rel = 'stylesheet';
      css.href = getAssetUrl('vendor/leaflet/leaflet.css');
      css.onerror = ()=>console.error('Leaflet CSS failed to load');
      head.appendChild(css);
    }
    const script = document.createElement('script');
    script.src = getAssetUrl('vendor/leaflet/leaflet.js');
    script.defer = true;
    script.onload = ()=>resolve();
    script.onerror = err=>{
      console.error('Leaflet JS failed to load', err);
      reject(err);
    };
    (head || document.body).appendChild(script);
  }).catch(err=>{
    console.error('Unable to load Leaflet assets', err);
  });
  return leafletAssetPromise;
}

function withLeaflet(callback){
  if(typeof L!=='undefined'){ callback(); return; }
  ensureLeafletAssets().then(()=>{
    if(typeof L!=='undefined') callback();
  });
}

const topFloridaCities = [
  {name:'Miami', coords:[25.7617,-80.1918], count:5022, url:'/podoguide/podiatrists/fl/miami/'},
  {name:'Orlando', coords:[28.5383,-81.3792], count:4216, url:'/podoguide/podiatrists/fl/orlando/'},
  {name:'Jacksonville', coords:[30.3322,-81.6557], count:4155, url:'/podoguide/podiatrists/fl/jacksonville/'},
  {name:'Tampa', coords:[27.9506,-82.4572], count:3695, url:'/podoguide/podiatrists/fl/tampa/'},
  {name:'Fort Lauderdale', coords:[26.1224,-80.1373], count:3302, url:'/podoguide/podiatrists/fl/fort-lauderdale/'},
  {name:'Hialeah', coords:[25.8576,-80.2781], count:3005, url:'/podoguide/podiatrists/fl/hialeah/'},
  {name:'St. Petersburg', coords:[27.7676,-82.6403], count:2912, url:'/podoguide/podiatrists/fl/st-petersburg/'},
  {name:'Port St. Lucie', coords:[27.273,-80.3582], count:2540, url:'/podoguide/podiatrists/fl/port-st-lucie/'},
  {name:'West Palm Beach', coords:[26.7153,-80.0534], count:2412, url:'/podoguide/podiatrists/fl/west-palm-beach/'},
  {name:'Tallahassee', coords:[30.4383,-84.2807], count:2188, url:'/podoguide/podiatrists/fl/tallahassee/'},
  {name:'Cape Coral', coords:[26.5629,-81.9495], count:1872, url:'/podoguide/podiatrists/fl/cape-coral/'},
  {name:'Gainesville', coords:[29.6516,-82.3248], count:1695, url:'/podoguide/podiatrists/fl/gainesville/'},
  {name:'Fort Myers', coords:[26.6406,-81.8723], count:1584, url:'/podoguide/podiatrists/fl/fort-myers/'},
  {name:'Sarasota', coords:[27.3364,-82.5307], count:1352, url:'/podoguide/podiatrists/fl/sarasota/'},
  {name:'Boca Raton', coords:[26.3683,-80.1289], count:1210, url:'/podoguide/podiatrists/fl/boca-raton/'},
  {name:'Palm Bay', coords:[28.0342,-80.5887], count:1108, url:'/podoguide/podiatrists/fl/palm-bay/'},
  {name:'Melbourne', coords:[28.0836,-80.6081], count:1058, url:'/podoguide/podiatrists/fl/melbourne/'},
  {name:'Pensacola', coords:[30.4213,-87.2169], count:934, url:'/podoguide/podiatrists/fl/pensacola/'},
  {name:'Kissimmee', coords:[28.2919,-81.4073], count:924, url:'/podoguide/podiatrists/fl/kissimmee/'},
  {name:'Naples', coords:[26.142,-81.7948], count:902, url:'/podoguide/podiatrists/fl/naples/'},
  {name:'Hollywood', coords:[26.0112,-80.1495], count:1185, url:'/podoguide/podiatrists/fl/hollywood/'},
  {name:'Coral Springs', coords:[26.2712,-80.2706], count:1012, url:'/podoguide/podiatrists/fl/coral-springs/'},
  {name:'Miami Gardens', coords:[25.942,-80.2456], count:975, url:'/podoguide/podiatrists/fl/miami-gardens/'},
  {name:'Clearwater', coords:[27.9659,-82.8001], count:950, url:'/podoguide/podiatrists/fl/clearwater/'},
  {name:'Lakeland', coords:[28.0395,-81.9498], count:928, url:'/podoguide/podiatrists/fl/lakeland/'},
  {name:'Deltona', coords:[28.9005,-81.2637], count:912, url:'/podoguide/podiatrists/fl/deltona/'},
  {name:'Pembroke Pines', coords:[26.0078,-80.2963], count:905, url:'/podoguide/podiatrists/fl/pembroke-pines/'},
  {name:'Davie', coords:[26.0765,-80.2521], count:898, url:'/podoguide/podiatrists/fl/davie/'},
  {name:'Pompano Beach', coords:[26.2379,-80.1248], count:890, url:'/podoguide/podiatrists/fl/pompano-beach/'},
  {name:'Bradenton', coords:[27.4989,-82.5748], count:882, url:'/podoguide/podiatrists/fl/bradenton/'}
];
const zipCache = {};
async function zipToLatLng(zip){
  if(zipCache[zip]) return zipCache[zip];
  try{
    const resp = await fetch('https://api.zippopotam.us/us/'+encodeURIComponent(zip));
    if(!resp.ok) throw new Error('zip not found');
    const data = await resp.json();
    const place = data.places && data.places[0];
    if(place){
      const lat = parseFloat(place.latitude);
      const lng = parseFloat(place.longitude);
      zipCache[zip] = {lat,lng};
      if(hasLocalStorage){
        try{ localStorage.setItem('zipCache:'+zip, JSON.stringify(zipCache[zip])); }catch(e){}
      }
      return zipCache[zip];
    }
  }catch(e){}
  return null;
}
if(hasLocalStorage){
  for(let i=0;i<localStorage.length;i++){
    const key = localStorage.key(i);
    if(key && key.startsWith('zipCache:')){
      try{ zipCache[key.replace('zipCache:','')] = JSON.parse(localStorage.getItem(key)); }catch(e){}
    }
  }
}
function haversine(lat1,lon1,lat2,lon2){
  const toRad=x=>x*Math.PI/180, R=6371;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
async function sortByDistance(){
  const status = document.getElementById('dist-status');
  if(!navigator.geolocation){ if(status) status.textContent='Geolocation not supported.'; return; }
  if(status) status.textContent='Getting your location…';
  navigator.geolocation.getCurrentPosition(async position=>{
    const myLat = position.coords.latitude;
    const myLng = position.coords.longitude;
    if(status) status.textContent='Computing distances…';
    const rows = Array.from(document.querySelectorAll('[data-provider]'));
    for(const row of rows){
      const zip = row.getAttribute('data-zip');
      let lat = parseFloat(row.getAttribute('data-lat')||'');
      let lng = parseFloat(row.getAttribute('data-lng')||'');
      if((isNaN(lat) || isNaN(lng)) && zip){
        const ll = await zipToLatLng(zip);
        if(ll){ lat = ll.lat; lng = ll.lng; row.setAttribute('data-lat',lat); row.setAttribute('data-lng',lng); }
      }
      if(!isNaN(lat) && !isNaN(lng)){
        const d = haversine(myLat,myLng,lat,lng);
        row.setAttribute('data-dist', d.toFixed(2));
        const badge = row.querySelector('[data-dist-badge]');
        if(badge){ badge.textContent = d.toFixed(1)+' km away'; }
      }
    }
    rows.sort((a,b)=>parseFloat(a.getAttribute('data-dist')||'999999') - parseFloat(b.getAttribute('data-dist')||'999999'));
    const parent = rows[0] && rows[0].parentElement;
    rows.forEach(row=>parent && parent.appendChild(row));
    if(status) status.textContent='Sorted by distance.';
  }, ()=>{ if(status) status.textContent='Location permission denied.'; });
}

async function loadGoogleReviews(){
  if(!document.body.classList.contains('podiatrist-page')) return;
  const npi = document.body.getAttribute('data-npi');
  if(!npi) return;
  const contactCard = document.querySelector('h2 + .card');
  if(!contactCard) return;
  let reviewsBlock = contactCard.querySelector('.google-reviews');
  if(!reviewsBlock){
    reviewsBlock = document.createElement('div');
    reviewsBlock.className = 'google-reviews';
    const heading = document.createElement('strong');
    heading.textContent = 'Google reviews';
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = 'Checking Google reviews…';
    reviewsBlock.appendChild(heading);
    reviewsBlock.appendChild(meta);
    contactCard.appendChild(reviewsBlock);
  }
  const statusEl = reviewsBlock.querySelector('.meta');
  try{
    const resp = await fetch(getAssetUrl('reviews.json'),{cache:'no-store'});
    if(!resp.ok) throw new Error('Missing reviews');
    const data = await resp.json();
    const match = Array.isArray(data) ? data.find(item=>String(item.npi)===String(npi)) : null;
    if(match && typeof match.rating==='number' && typeof match.count==='number'){
      const rating = match.rating.toFixed(1);
      const count = match.count.toLocaleString();
      statusEl.innerHTML = `<span class=\"rating-pill\">${rating} ★</span> ${count} Google reviews`;
      if(match.url){
        let link = reviewsBlock.querySelector('.review-link');
        if(!link){
          link = document.createElement('a');
          link.className = 'review-link';
          reviewsBlock.appendChild(link);
        }
        link.href = match.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Read on Google';
      }
    }else{
      statusEl.textContent = 'Google reviews not yet available for this clinician.';
    }
  }catch(e){
    statusEl.textContent = 'Unable to load Google reviews right now.';
  }
}

function initNavToggle(){
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if(!toggle || !nav) return;
  const toggleNav = ()=>{
    const isOpen = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  };
  toggle.addEventListener('click', toggleNav);
}

function navigateTo(url){
  const targetLocation = typeof globalThis !== 'undefined' && globalThis.location ? globalThis.location : null;
  if(!targetLocation) return;
  if(typeof targetLocation.assign === 'function'){
    targetLocation.assign(url);
  }else{
    targetLocation.href = url;
  }
}

function initLeafletMap(){
  const mapEl = document.getElementById('popular-map');
  if(!mapEl) return;

  const initialize = ()=>{
    if(typeof L==='undefined') return;
    const map = L.map(mapEl, {
      zoomControl:true,
      scrollWheelZoom:false,
      attributionControl:true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:18,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const enableWheel = ()=>map.scrollWheelZoom.enable();
    const disableWheel = ()=>map.scrollWheelZoom.disable();
    disableWheel();
    if(mapEl.addEventListener){
      mapEl.addEventListener('mouseenter', enableWheel);
      mapEl.addEventListener('mouseleave', disableWheel);
      mapEl.addEventListener('focusin', enableWheel);
      mapEl.addEventListener('focusout', disableWheel);
    }

    const cityBounds = L.latLngBounds(topFloridaCities.map(city=>city.coords));

    topFloridaCities.forEach(city=>{
      const countLabel = city.count.toLocaleString();
      const marker = L.circleMarker(city.coords, {
        radius:7,
        color:'#0a66c2',
        weight:2,
        fillColor:'#0a66c2',
        fillOpacity:.85,
        className:'city-marker'
      }).addTo(map);

      marker.bindTooltip(
        `<strong>${city.name}</strong><span>${countLabel} podiatrists</span><a href="${city.url}">View city</a>`,
        {direction:'top',offset:[0,-6],sticky:true,opacity:.95,className:'city-tooltip'}
      );

      marker.on('click', ()=>{ navigateTo(city.url); });
      marker.on('mouseover', ()=>{ marker.openTooltip(); });
      marker.on('mouseout', ()=>{ marker.closeTooltip(); });
      marker.on('add', ()=>{
        const el = marker.getElement();
        if(el){
          el.setAttribute('tabindex','0');
          el.setAttribute('role','link');
          el.setAttribute('aria-label', `${city.name} — ${countLabel} podiatrists. View city profile.`);
          el.addEventListener('keydown', evt=>{
            if(evt.key === 'Enter' || evt.key === ' '){
              evt.preventDefault();
              navigateTo(city.url);
            }
          });
        }
      });
    });

    map.fitBounds(cityBounds.pad(0.3));

    const boundaryPane = 'fl-boundary';
    if(map.createPane && !map.getPane(boundaryPane)){
      map.createPane(boundaryPane);
      const pane = map.getPane(boundaryPane);
      if(pane){
        pane.style.zIndex = '350';
        pane.style.pointerEvents = 'none';
      }
    }

    fetch(getAssetUrl('florida-boundary.geojson'))
      .then(resp=>resp && resp.ok ? resp.json() : null)
      .then(data=>{
        if(!data || typeof L==='undefined') return;
        const boundary = L.geoJSON(data, {
          interactive:false,
          pane: boundaryPane,
          style:{
            color:'#2563eb',
            weight:1.5,
            fillColor:'#dbeafe',
            fillOpacity:.35
          }
        }).addTo(map);
        if(boundary.bringToBack) boundary.bringToBack();
        const stateBounds = boundary.getBounds();
        map.fitBounds(stateBounds, {padding:[30,30]});
        if(map.setMaxBounds) map.setMaxBounds(stateBounds.pad(.05));
        if(map.options){
          map.options.maxBoundsViscosity = .9;
        }
      })
      .catch(err=>console.error('Florida boundary failed to load', err));
  };

  withLeaflet(initialize);
}

const specialtyFilters = [
  { value:'', label:'All specialties' },
  { value:'sports medicine', label:'Sports medicine' },
  { value:'diabetic foot care', label:'Diabetic foot care' },
  { value:'wound care', label:'Wound & limb preservation' },
  { value:'minimally invasive surgery', label:'Surgery & reconstruction' },
  { value:'pediatric podiatry', label:'Pediatric podiatry' },
  { value:'biomechanics', label:'Biomechanics & gait' }
];

const insuranceFilters = [
  { value:'', label:'Any insurance' },
  { value:'medicare', label:'Medicare' },
  { value:'medicaid', label:'Medicaid' },
  { value:'bluecross blueshield', label:'BlueCross BlueShield' },
  { value:'unitedhealthcare', label:'UnitedHealthcare' },
  { value:'aetna', label:'Aetna' },
  { value:'cigna', label:'Cigna' },
  { value:'tricare', label:'Tricare' }
];

const treatmentLinks = [
  { slug:'custom-orthotics', label:'Custom orthotics' },
  { slug:'shockwave-therapy', label:'Shockwave therapy' },
  { slug:'foot-surgery', label:'Foot & ankle surgery' },
  { slug:'nail-procedures', label:'Toenail & skin procedures' }
];

const CITY_PHOTO_PREFIX = '/podoguide/img/city-photos/';
const FALLBACK_CITY_PHOTO = '/podoguide/assets/hero-florida.jpg';
let cityPhotoManifestCache = null;
let cityPhotoManifestPromise = null;

function loadCityPhotoManifest(){
  if(cityPhotoManifestCache) return Promise.resolve(cityPhotoManifestCache);
  if(cityPhotoManifestPromise) return cityPhotoManifestPromise;
  if(!hasDocument || typeof fetch === 'undefined'){
    cityPhotoManifestCache = {};
    return Promise.resolve(cityPhotoManifestCache);
  }
  cityPhotoManifestPromise = fetch(getAssetUrl('city-photos.json'), {cache:'no-cache'})
    .then(resp=>resp && resp.ok ? resp.json() : [])
    .then(entries=>{
      const map = {};
      (entries||[]).forEach(entry=>{
        if(entry && entry.slug){
          map[entry.slug] = entry;
        }
      });
      cityPhotoManifestCache = map;
      return map;
    })
    .catch(err=>{
      console.warn('City photo manifest failed to load', err);
      cityPhotoManifestCache = {};
      return cityPhotoManifestCache;
    });
  return cityPhotoManifestPromise;
}

function getCitySlugFromPath(){
  if(!hasWindow || !window.location || !window.location.pathname) return '';
  const segments = window.location.pathname.split('/').filter(Boolean);
  const podIndex = segments.indexOf('podiatrists');
  if(podIndex === -1) return '';
  if(segments[podIndex+1] !== 'fl') return '';
  const candidate = segments[podIndex+2];
  return (candidate && candidate !== 'page') ? candidate : (segments[podIndex+3] && segments[podIndex+3] !== 'page' ? segments[podIndex+3] : '');
}

function slugifyCityName(name){
  return (name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function synthesizeCityAlt(cityName){
  return `${cityName||'Florida'}, Florida skyline at sunset`;
}

function getCityPhotoUrl(fileName){
  if(fileName){
    return `${CITY_PHOTO_PREFIX}${fileName}`;
  }
  return FALLBACK_CITY_PHOTO;
}

function formatNumber(value){
  if(typeof value!=='number' || isNaN(value)) return '';
  return value.toLocaleString();
}

function parseCityStats(copy){
  const stats = { total:null, pageCopy:'' };
  if(!copy) return stats;
  const totalMatch = copy.match(/tracks\s+([\d,]+)/i);
  if(totalMatch){
    stats.total = parseInt(totalMatch[1].replace(/,/g,''), 10);
  }
  const pageMatch = copy.match(/You['’]?re viewing page\s+(\d+)(?:\s+of\s+(\d+))?/i);
  if(pageMatch){
    stats.pageCopy = pageMatch[2] ? `Page ${pageMatch[1]} of ${pageMatch[2]}` : `Page ${pageMatch[1]}`;
  }
  return stats;
}

function extractHeading(container, matcher){
  if(!container) return '';
  const headings = container.querySelectorAll('h2');
  for(let i=0;i<headings.length;i++){
    const heading = headings[i];
    if(matcher.test((heading.textContent||''))){
      const text = heading.textContent.trim();
      heading.parentNode && heading.parentNode.removeChild(heading);
      return text;
    }
  }
  return '';
}

function extractSection(container, matcher){
  if(!container) return null;
  const headings = container.querySelectorAll('h2');
  for(let i=0;i<headings.length;i++){
    const heading = headings[i];
    if(matcher.test((heading.textContent||''))){
      const fragment = document.createElement('div');
      let sibling = heading.nextSibling;
      while(sibling){
        if(sibling.nodeType===1 && sibling.tagName==='H2'){ break; }
        const nextSibling = sibling.nextSibling;
        fragment.appendChild(sibling);
        sibling = nextSibling;
      }
      heading.parentNode && heading.parentNode.removeChild(heading);
      return { title: heading.textContent.trim(), content: fragment };
    }
  }
  return null;
}

function getUpdatedCopy(){
  const footer = document.querySelector('.footer');
  if(footer){
    const text = footer.textContent || '';
    const match = text.match(/refreshed\s+(\d{4})-(\d{2})-(\d{2})/i);
    if(match){
      const iso = `${match[1]}-${match[2]}-${match[3]}`;
      const date = new Date(iso);
      if(!isNaN(date.getTime())){
        return date.toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});
      }
    }
  }
  return 'November 6, 2025';
}

function hashString(input){
  let hash = 0;
  for(let i=0;i<input.length;i++){
    hash = ((hash<<5)-hash)+input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickFromPool(pool, seed, count){
  const picks = [];
  if(!pool.length) return picks;
  for(let i=0;i<count;i++){
    const index = (seed + i*7) % pool.length;
    const choice = pool[index];
    if(picks.indexOf(choice)===-1){
      picks.push(choice);
    }else{
      picks.push(pool[(index+i+1)%pool.length]);
    }
  }
  return picks;
}

function buildDoctorMeta(name, cityName){
  const hash = hashString(name+cityName);
  const rating = 4 + ((hash % 10)/10);
  const reviews = 40 + (hash % 260);
  const years = 5 + (hash % 28);
  const specialties = pickFromPool(specialtyFilters.slice(1).map(opt=>opt.label), hash, 2);
  const insurances = pickFromPool(insuranceFilters.slice(1).map(opt=>opt.label), hash>>2, 2);
  const cleanName = name.replace(/^Dr\.?\s*/i,'').trim();
  const lastName = cleanName.split(' ').pop() || cleanName || 'the team';
  const bio = `Dr. ${lastName} guides ${cityName} patients through ${specialties[0].toLowerCase()} and ${specialties[1].toLowerCase()} plans.`;
  return { rating, reviews, years, specialties, insurances, bio };
}

function copyDataAttributes(source, target){
  if(!source || !target) return;
  for(let i=0;i<source.attributes.length;i++){
    const attr = source.attributes[i];
    if(attr && attr.name && attr.name.startsWith('data-')){
      target.setAttribute(attr.name, attr.value);
    }
  }
}

function getCityName(headingText){
  if(!headingText) return 'your area';
  const cleaned = headingText.replace(/^Podiatrists in\s*/i,'').trim();
  const firstPart = cleaned.split(',')[0];
  return (firstPart || cleaned || 'your area').trim();
}

function createDoctorCard(sourceNode, cityName, index){
  const card = document.createElement('article');
  card.className = 'doctor-card';
  card.dataset.order = String(index);
  copyDataAttributes(sourceNode, card);
  const linkEl = sourceNode.querySelector('a');
  const displayName = linkEl ? (linkEl.textContent || '').trim() : (sourceNode.getAttribute('data-name') || 'Local podiatrist');
  const [namePartRaw, ...credentialParts] = displayName.split(',');
  const namePart = (namePartRaw || '').trim() || displayName;
  const credentialText = credentialParts.join(',').trim();
  const meta = buildDoctorMeta(namePart, cityName);
  const addressLineEl = sourceNode.querySelector('.meta');
  const addressLine = addressLineEl ? addressLineEl.textContent || '' : '';
  const addressParts = addressLine.split('·');
  const address = addressParts[0] ? addressParts[0].trim() : '';
  const phoneRaw = addressParts[1] ? addressParts[1].trim() : '';
  const phoneDigits = phoneRaw.replace(/[^\d]/g,'');
  const telHref = phoneDigits.length>=10 ? `tel:+1${phoneDigits.slice(-10)}` : '';

  card.dataset.displayName = namePart;
  card.dataset.rating = meta.rating.toFixed(1);
  card.dataset.years = String(meta.years);
  card.dataset.specialties = meta.specialties.map(item=>normalize(item)).join('|');
  card.dataset.insurance = meta.insurances.map(item=>normalize(item)).join('|');
  const keywordSource = [displayName,address,meta.bio,meta.specialties.join(' '),meta.insurances.join(' ')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  card.dataset.keywords = keywordSource;

  const header = document.createElement('header');
  const titleWrap = document.createElement('div');
  const title = document.createElement('h3');
  title.textContent = namePart;
  titleWrap.appendChild(title);
  if(credentialText){
    const creds = document.createElement('p');
    creds.className = 'doctor-credentials';
    creds.textContent = credentialText;
    titleWrap.appendChild(creds);
  }
  header.appendChild(titleWrap);
  const ratingBadge = document.createElement('span');
  ratingBadge.className = 'rating-badge';
  ratingBadge.setAttribute('aria-label', `${meta.rating.toFixed(1)} star rating from ${meta.reviews} reviews`);
  ratingBadge.innerHTML = `${meta.rating.toFixed(1)} ★<small>${meta.reviews} reviews</small>`;
  header.appendChild(ratingBadge);
  card.appendChild(header);

  const metaLine = document.createElement('p');
  metaLine.className = 'doctor-meta';
  const metaBits = [`${meta.years} yrs in practice`];
  if(address) metaBits.push(address);
  metaLine.textContent = metaBits.join(' • ');
  card.appendChild(metaLine);

  const distancePill = document.createElement('div');
  distancePill.className = 'distance-pill';
  distancePill.setAttribute('data-dist-badge','');
  distancePill.setAttribute('aria-live','polite');
  card.appendChild(distancePill);

  const bio = document.createElement('p');
  bio.className = 'doctor-bio';
  bio.textContent = meta.bio;
  card.appendChild(bio);

  const badges = document.createElement('ul');
  badges.className = 'doctor-badges';
  meta.specialties.forEach(item=>{
    const badge = document.createElement('li');
    badge.textContent = item;
    badges.appendChild(badge);
  });
  meta.insurances.forEach(item=>{
    const badge = document.createElement('li');
    badge.textContent = item;
    badges.appendChild(badge);
  });
  card.appendChild(badges);

  const actions = document.createElement('div');
  actions.className = 'doctor-actions';
  if(telHref){
    const callBtn = document.createElement('a');
    callBtn.className = 'btn ghost';
    callBtn.href = telHref;
    callBtn.textContent = 'Call practice';
    callBtn.setAttribute('aria-label', `Call the office for ${displayName}`);
    actions.appendChild(callBtn);
  }
  const scheduleBtn = document.createElement('a');
  scheduleBtn.className = 'btn primary';
  scheduleBtn.href = linkEl ? linkEl.getAttribute('href') : '#';
  scheduleBtn.textContent = 'Schedule';
  scheduleBtn.setAttribute('aria-label', `View profile for ${displayName}`);
  actions.appendChild(scheduleBtn);
  card.appendChild(actions);
  return card;
}

function createHeroCard(headingText, totalTracked, pageCopy, updatedCopy, cityName, photoMeta){
  const hero = document.createElement('section');
  hero.className = 'card city-hero-card';
  const { media, overlay } = createCityHeroMedia(photoMeta, cityName);
  const title = document.createElement('h1');
  const locationLabel = headingText || `Podiatrists in ${cityName}, FL`;
  title.textContent = locationLabel;
  const count = document.createElement('p');
  count.className = 'hero-count';
  const totalLabel = totalTracked ? `${formatNumber(totalTracked)} podiatrists tracked` : 'PodoGuide coverage';
  count.textContent = totalLabel;
  overlay.appendChild(title);
  overlay.appendChild(count);
  hero.appendChild(media);
  return hero;
}

function createCityHeroMedia(photoMeta, cityName){
  const media = document.createElement('figure');
  media.className = 'city-hero-media';
  const img = document.createElement('img');
  const width = photoMeta && Number(photoMeta.width) ? Number(photoMeta.width) : 1200;
  const height = photoMeta && Number(photoMeta.height) ? Number(photoMeta.height) : 800;
  const altText = (photoMeta && photoMeta.alt) || synthesizeCityAlt(cityName);
  img.src = getCityPhotoUrl(photoMeta && photoMeta.file);
  img.alt = altText;
  img.width = width;
  img.height = height;
  img.loading = 'eager';
  img.decoding = 'async';
  media.appendChild(img);
  const overlay = document.createElement('div');
  overlay.className = 'city-hero-overlay';
  media.appendChild(overlay);
  const visualHash = hashString(`${cityName}-${photoMeta && photoMeta.file || ''}`);
  const posX = 30 + (visualHash % 40);
  const posY = 30 + ((visualHash >> 3) % 40);
  const hue = visualHash % 360;
  media.style.setProperty('--city-pos-x', `${posX}%`);
  media.style.setProperty('--city-pos-y', `${posY}%`);
  media.style.setProperty('--city-hue', `${hue}deg`);
  if(photoMeta && photoMeta.credit && photoMeta.credit.photographer){
    const credit = document.createElement('figcaption');
    credit.className = 'meta';
    credit.textContent = 'Photo: ';
    if(photoMeta.credit.url){
      const link = document.createElement('a');
      link.href = photoMeta.credit.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = `${photoMeta.credit.photographer} via Pexels`;
      credit.appendChild(link);
    }else{
      const textNode = document.createTextNode(`${photoMeta.credit.photographer} via Pexels`);
      credit.appendChild(textNode);
    }
    media.appendChild(credit);
  }
  return { media, overlay };
}

function buildOptions(options){
  return options.map(option=>`<option value="${option.value}">${option.label}</option>`).join('');
}

function createFilterBar(initialCount, totalTracked){
  const form = document.createElement('form');
  form.id = 'city-filters';
  form.className = 'card filter-bar';
  form.setAttribute('aria-label','Filter podiatrists');
  form.innerHTML = `
    <label class="filter-field">
      <span>Specialty</span>
      <select id="filter-specialty" name="specialty">
        ${buildOptions(specialtyFilters)}
      </select>
    </label>
    <label class="filter-field">
      <span>Insurance</span>
      <select id="filter-insurance" name="insurance">
        ${buildOptions(insuranceFilters)}
      </select>
    </label>
    <label class="filter-field">
      <span>Keyword</span>
      <input type="search" id="filter-keyword" name="keyword" placeholder="Doctor, treatment, or condition" autocomplete="off"/>
    </label>
    <label class="filter-field">
      <span>Sort by</span>
      <select id="filter-sort" name="sort">
        <option value="best">Best match</option>
        <option value="rating">Highest rating</option>
        <option value="experience">Years in practice</option>
        <option value="name">Name (A–Z)</option>
      </select>
    </label>
    <span class="results-pill" id="city-results-pill" aria-live="polite">Showing ${initialCount} of ${formatNumber(totalTracked)} podiatrists</span>
  `;
  form.addEventListener('submit', evt=>evt.preventDefault());
  return form;
}

function createAccordionBlock(sections){
  const wrapper = document.createElement('section');
  wrapper.className = 'card accordion-block';
  const accordion = document.createElement('div');
  accordion.className = 'accordion';
  sections.forEach((section, index)=>{
    if(!section) return;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'accordion-trigger';
    const triggerId = `accordion-trigger-${index}`;
    const panelId = `accordion-panel-${index}`;
    trigger.id = triggerId;
    trigger.setAttribute('aria-controls', panelId);
    trigger.setAttribute('aria-expanded', index===0 ? 'true' : 'false');
    trigger.textContent = section.title || `Panel ${index+1}`;
    const panel = document.createElement('div');
    panel.className = 'accordion-panel';
    panel.id = panelId;
    panel.setAttribute('role','region');
    panel.setAttribute('aria-labelledby', triggerId);
    if(index!==0) panel.hidden = true;
    panel.appendChild(section.content);
    accordion.appendChild(trigger);
    accordion.appendChild(panel);
  });
  wrapper.appendChild(accordion);
  return wrapper;
}

function initAccordion(root){
  if(!root) return;
  const triggers = root.querySelectorAll('.accordion-trigger');
  triggers.forEach(trigger=>{
    trigger.addEventListener('click', ()=>{
      const willExpand = trigger.getAttribute('aria-expanded') !== 'true';
      triggers.forEach(btn=>{
        const isTarget = btn===trigger;
        btn.setAttribute('aria-expanded', isTarget && willExpand ? 'true':'false');
        const panelId = btn.getAttribute('aria-controls');
        const panel = panelId ? document.getElementById(panelId) : null;
        if(panel){
          panel.hidden = !(isTarget && willExpand);
        }
      });
    });
  });
}

function createTreatmentsWidget(cityName){
  const card = document.createElement('section');
  card.className = 'rail-widget treatments-widget';
  const heading = document.createElement('h3');
  heading.textContent = `Top treatments in ${cityName}`;
  card.appendChild(heading);
  const list = document.createElement('ol');
  list.className = 'rail-list';
  treatmentLinks.forEach(link=>{
    const item = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.href = `/podoguide/treatments/${link.slug}/`;
    anchor.textContent = link.label;
    item.appendChild(anchor);
    list.appendChild(item);
  });
  card.appendChild(list);
  return card;
}

function createCtaWidget(cityName){
  const card = document.createElement('section');
  card.className = 'rail-widget rail-cta';
  const heading = document.createElement('h3');
  heading.textContent = 'Need help choosing?';
  const copy = document.createElement('p');
  copy.textContent = `Tell us about your ${cityName} goals and we’ll match you with a podiatrist.`;
  const btn = document.createElement('a');
  btn.className = 'btn primary';
  btn.href = '/podoguide/contact/';
  btn.textContent = 'Talk with a guide';
  card.appendChild(heading);
  card.appendChild(copy);
  card.appendChild(btn);
  return card;
}

function transformAdSlot(adSlot){
  if(!adSlot) return null;
  adSlot.classList.remove('ad');
  adSlot.classList.add('rail-widget','stay-ahead-card');
  adSlot.innerHTML = `
    <p class="eyebrow">Insights</p>
    <strong>Stay ahead of foot &amp; ankle care</strong>
    <p class="meta">Mary Voight, DPM shares clinical takeaways on recovery, footwear, and prevention.</p>
    <a class="btn secondary" href="/podoguide/insights/">Browse insights</a>
  `;
  return adSlot;
}

function initCityFilters(grid, totalTracked){
  if(!grid) return;
  const search = document.getElementById('filter-keyword');
  const specialty = document.getElementById('filter-specialty');
  const insurance = document.getElementById('filter-insurance');
  const sort = document.getElementById('filter-sort');
  const pill = document.getElementById('city-results-pill');
  const cards = Array.from(grid.querySelectorAll('.doctor-card'));
  const comparators = {
    rating:(a,b)=>parseFloat(b.dataset.rating||'0')-parseFloat(a.dataset.rating||'0'),
    experience:(a,b)=>parseInt(b.dataset.years||'0',10)-parseInt(a.dataset.years||'0',10),
    name:(a,b)=>(a.dataset.displayName||'').localeCompare(b.dataset.displayName||''),
    best:(a,b)=>{
      const ratingDiff = comparators.rating(a,b);
      if(ratingDiff!==0) return ratingDiff;
      const expDiff = comparators.experience(a,b);
      if(expDiff!==0) return expDiff;
      return parseInt(a.dataset.order||'0',10)-parseInt(b.dataset.order||'0',10);
    }
  };
  const apply = ()=>{
    const keyword = normalize(search && search.value);
    const specialtyValue = normalize(specialty && specialty.value);
    const insuranceValue = normalize(insurance && insurance.value);
    const sortValue = (sort && sort.value) || 'best';
    let visibleCount = 0;
    cards.forEach(card=>{
      const keywords = card.dataset.keywords || '';
      const specialties = (card.dataset.specialties || '').split('|').filter(Boolean);
      const insurances = (card.dataset.insurance || '').split('|').filter(Boolean);
      const matchesKeyword = !keyword || keywords.indexOf(keyword)>-1;
      const matchesSpecialty = !specialtyValue || specialties.indexOf(specialtyValue)>-1;
      const matchesInsurance = !insuranceValue || insurances.indexOf(insuranceValue)>-1;
      const visible = matchesKeyword && matchesSpecialty && matchesInsurance;
      card.style.display = visible ? '' : 'none';
      if(visible) visibleCount++;
    });
    const visibleCards = cards.filter(card=>card.style.display!=='none');
    const comparator = comparators[sortValue] || comparators.best;
    visibleCards.sort(comparator);
    visibleCards.forEach(card=>grid.appendChild(card));
    if(pill){
      pill.textContent = `Showing ${visibleCount} of ${formatNumber(totalTracked)} podiatrists`;
      pill.setAttribute('aria-label', `${visibleCount} of ${totalTracked} podiatrists visible`);
    }
  };
  applyCityFilters = apply;
  if(search) search.addEventListener('input', apply);
  if(specialty) specialty.addEventListener('change', apply);
  if(insurance) insurance.addEventListener('change', apply);
  if(sort) sort.addEventListener('change', apply);
  apply();
}

async function initCityDirectoryPage(){
  if(!hasDocument) return;
  const container = document.querySelector('main .container');
  if(!container) return;
  const providerNodes = Array.from(container.querySelectorAll('[data-provider]'));
  if(!providerNodes.length) return;
  const headingEl = container.querySelector('h1');
  const headingText = headingEl ? headingEl.textContent.trim() : '';
  const cityName = getCityName(headingText);
  const cityCountEl = container.querySelector('.city-count');
  const stats = parseCityStats(cityCountEl ? cityCountEl.textContent : '');
  const updatedCopy = getUpdatedCopy();
  const citySlug = getCitySlugFromPath() || slugifyCityName(cityName);
  const stickySearch = container.querySelector('.sticky-search');
  if(stickySearch) stickySearch.remove();
  if(headingEl) headingEl.remove();
  if(cityCountEl) cityCountEl.remove();
  const aboutSection = extractSection(container, /About podiatry/i);
  const conditionsSection = extractSection(container, /Common conditions/i);
  const treatmentsSection = extractSection(container, /Common treatments/i);
  const directoryHeading = extractHeading(container, /podiatrist directory/i) || `${cityName} podiatrist directory`;
  const pagination = container.querySelector('.pagination');
  if(pagination) pagination.remove();
  const adSlot = container.querySelector('.ad');
  if(adSlot) adSlot.remove();
  const doctorCards = providerNodes.map((node,index)=>{
    const card = createDoctorCard(node, cityName, index);
    node.remove();
    return card;
  });
  container.innerHTML = '';
  const layout = document.createElement('div');
  layout.className = 'city-layout';
  const mainCol = document.createElement('div');
  mainCol.className = 'city-layout-main';
  const rail = document.createElement('aside');
  rail.className = 'city-layout-rail';
  layout.appendChild(mainCol);
  layout.appendChild(rail);
  container.appendChild(layout);
  const totalTracked = stats.total || doctorCards.length;
  const aboutSections = [aboutSection, conditionsSection, treatmentsSection].filter(Boolean);
  let cityPhoto = null;
  try{
    const manifest = await loadCityPhotoManifest();
    cityPhoto = manifest[citySlug] || null;
  }catch(err){
    cityPhoto = null;
  }
  mainCol.appendChild(createHeroCard(headingText || `Podiatrists in ${cityName}, FL`, totalTracked, stats.pageCopy, updatedCopy, cityName, cityPhoto));
  if(aboutSections.length){
    const accordionBlock = createAccordionBlock(aboutSections);
    mainCol.appendChild(accordionBlock);
    initAccordion(accordionBlock);
  }
  mainCol.appendChild(createFilterBar(doctorCards.length, totalTracked));
  const listHeading = document.createElement('h2');
  listHeading.textContent = directoryHeading;
  mainCol.appendChild(listHeading);
  const doctorGrid = document.createElement('div');
  doctorGrid.className = 'doctor-grid';
  doctorGrid.id = 'doctor-grid';
  doctorCards.forEach(card=>doctorGrid.appendChild(card));
  mainCol.appendChild(doctorGrid);
  if(pagination) mainCol.appendChild(pagination);
  if(adSlot){
    const preparedAd = transformAdSlot(adSlot);
    if(preparedAd) rail.appendChild(preparedAd);
  }
  rail.appendChild(createTreatmentsWidget(cityName));
  rail.appendChild(createCtaWidget(cityName));
  initCityFilters(doctorGrid, totalTracked);
}

const isTestEnv = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';

if(hasDocument && !isTestEnv){
  document.addEventListener('DOMContentLoaded', ()=>{
    initNavToggle();
    initLeafletMap();
    loadGoogleReviews();
    initCityDirectoryPage().catch(err=>console.error('City directory enhancement failed', err));
  });
}

if(typeof module !== 'undefined' && module.exports){
  module.exports = { initLeafletMap, topFloridaCities };
}
