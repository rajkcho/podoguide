function normalize(value){return (value||'').toLowerCase();}

function filterProviders(){
  const q = normalize(document.getElementById('city-q') && document.getElementById('city-q').value);
  const gender = normalize(document.getElementById('city-gender') && document.getElementById('city-gender').value);
  document.querySelectorAll('[data-provider]').forEach(row=>{
    const name = normalize(row.getAttribute('data-name'));
    const g = normalize(row.getAttribute('data-gender'));
    const matchesName = !q || name.includes(q);
    const matchesGender = !gender || (g && g===gender);
    row.style.display = (matchesName && matchesGender) ? '' : 'none';
  });
}

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
      try{ localStorage.setItem('zipCache:'+zip, JSON.stringify(zipCache[zip])); }catch(e){}
      return zipCache[zip];
    }
  }catch(e){}
  return null;
}
for(let i=0;i<localStorage.length;i++){
  const key = localStorage.key(i);
  if(key && key.startsWith('zipCache:')){
    try{ zipCache[key.replace('zipCache:','')] = JSON.parse(localStorage.getItem(key)); }catch(e){}
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
    const resp = await fetch('/podoguide/assets/reviews.json',{cache:'no-store'});
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

document.addEventListener('DOMContentLoaded', ()=>{
  initNavToggle();
  loadGoogleReviews();
});
