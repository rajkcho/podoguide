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

function initLeafletMap(){
  const mapEl = document.getElementById('popular-map');
  if(!mapEl || typeof L==='undefined') return;

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
  mapEl.addEventListener('mouseenter', enableWheel);
  mapEl.addEventListener('mouseleave', disableWheel);
  mapEl.addEventListener('focusin', enableWheel);
  mapEl.addEventListener('focusout', disableWheel);

  const cities = [
    {name:'Miami', coords:[25.7617,-80.1918], count:5022, url:'/podoguide/podiatrists/fl/miami/'},
    {name:'Orlando', coords:[28.5383,-81.3792], count:4216, url:'/podoguide/podiatrists/fl/orlando/'},
    {name:'Jacksonville', coords:[30.3322,-81.6557], count:4155, url:'/podoguide/podiatrists/fl/jacksonville/'},
    {name:'Tampa', coords:[27.9506,-82.4572], count:3695, url:'/podoguide/podiatrists/fl/tampa/'},
    {name:'Gainesville', coords:[29.6516,-82.3248], count:1695, url:'/podoguide/podiatrists/fl/gainesville/'},
    {name:'Fort Myers', coords:[26.6406,-81.8723], count:1584, url:'/podoguide/podiatrists/fl/fort-myers/'},
    {name:'Melbourne', coords:[28.0836,-80.6081], count:1058, url:'/podoguide/podiatrists/fl/melbourne/'},
    {name:'St. Petersburg', coords:[27.7676,-82.6403], count:943, url:'/podoguide/podiatrists/fl/st-petersburg/'},
    {name:'Pensacola', coords:[30.4213,-87.2169], count:934, url:'/podoguide/podiatrists/fl/pensacola/'},
    {name:'Kissimmee', coords:[28.2919,-81.4073], count:924, url:'/podoguide/podiatrists/fl/kissimmee/'}
  ];

  const cityBounds = L.latLngBounds(cities.map(city=>city.coords));

  cities.forEach(city=>{
    const countLabel = city.count.toLocaleString();
    const marker = L.circleMarker(city.coords, {
      radius:6,
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

    marker.on('click', ()=>{ window.location.href = city.url; });
    marker.on('add', ()=>{
      const el = marker.getElement();
      if(el){
        el.setAttribute('tabindex','0');
        el.setAttribute('role','link');
        el.setAttribute('aria-label', `${city.name} — ${countLabel} podiatrists. View city profile.`);
        el.addEventListener('keydown', evt=>{
          if(evt.key === 'Enter' || evt.key === ' '){
            evt.preventDefault();
            window.location.href = city.url;
          }
        });
      }
    });
  });

  map.fitBounds(cityBounds.pad(0.2));

  fetch('/podoguide/assets/florida-boundary.geojson')
    .then(resp=>resp.ok ? resp.json() : null)
    .then(data=>{
      if(!data) return;
      const boundary = L.geoJSON(data, {
        style:{
          color:'#2563eb',
          weight:1.5,
          fillColor:'#dbeafe',
          fillOpacity:.35
        }
      }).addTo(map);
      map.fitBounds(boundary.getBounds(), {padding:[12,12]});
    })
    .catch(()=>{});
}

document.addEventListener('DOMContentLoaded', ()=>{
  initNavToggle();
  initLeafletMap();
  loadGoogleReviews();
});
