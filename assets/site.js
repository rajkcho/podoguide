
function normalize(s){return (s||'').toLowerCase();}
let cityPaginationState = null;
function filterCities(){
  const q = normalize(document.getElementById('home-q').value);
  const cards = document.querySelectorAll('[data-city-card]');
  cards.forEach(card=>{
    const text = normalize(card.getAttribute('data-city') + ' ' + card.getAttribute('data-state'));
    card.style.display = text.includes(q) ? '' : 'none';
  });
}
function filterProviders(){
  const q = normalize(document.getElementById('city-q').value);
  const gender = normalize(document.getElementById('city-gender').value);
  document.querySelectorAll('[data-provider]').forEach(row=>{
    const name = normalize(row.getAttribute('data-name'));
    const g = normalize(row.getAttribute('data-gender'));
    const okName = name.includes(q);
    const okGender = !gender || (g && g===gender);
    row.dataset.match = (okName && okGender) ? 'true' : 'false';
  });
  if(cityPaginationState){ cityPaginationState.currentPage = 1; }
  refreshCityPagination();
}
const zipCache = {};
async function zipToLatLng(uszip){
  if(zipCache[uszip]) return zipCache[uszip];
  try{
    const resp = await fetch('https://api.zippopotam.us/us/'+encodeURIComponent(uszip));
    if(!resp.ok) throw new Error('zip not found');
    const data = await resp.json();
    const place = data.places && data.places[0];
    const lat = parseFloat(place['latitude']);
    const lng = parseFloat(place['longitude']);
    zipCache[uszip] = {lat,lng};
    try{ localStorage.setItem('zipCache:'+uszip, JSON.stringify(zipCache[uszip])); }catch(e){}
    return zipCache[uszip];
  }catch(e){ return null; }
}
for(let i=0;i<localStorage.length;i++){
  const k = localStorage.key(i);
  if(k && k.startsWith('zipCache:')){
    try{ zipCache[k.replace('zipCache:','')] = JSON.parse(localStorage.getItem(k)); }catch(e){}
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
  if(!navigator.geolocation){ status.textContent='Geolocation not supported.'; return; }
  status.textContent='Getting your location…';
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const myLat=pos.coords.latitude, myLng=pos.coords.longitude;
    status.textContent='Computing distances…';
    const rows = Array.from(document.querySelectorAll('[data-provider]'));
    for(const row of rows){
      const zip = row.getAttribute('data-zip');
      let lat = parseFloat(row.getAttribute('data-lat')||'NaN');
      let lng = parseFloat(row.getAttribute('data-lng')||'NaN');
      if(isNaN(lat)||isNaN(lng)){
        if(zip){
          const ll = await zipToLatLng(zip);
          if(ll){ lat=ll.lat; lng=ll.lng; row.setAttribute('data-lat',lat); row.setAttribute('data-lng',lng); }
        }
      }
      if(!isNaN(lat)&&!isNaN(lng)){
        const d = haversine(myLat,myLng,lat,lng);
        row.setAttribute('data-dist', d.toFixed(2));
        const badge = row.querySelector('[data-dist-badge]');
        if(badge){ badge.textContent = d.toFixed(1)+' km away'; }
      }
    }
    rows.sort((a,b)=>parseFloat(a.getAttribute('data-dist')||'999999') - parseFloat(b.getAttribute('data-dist')||'999999'));
    const container = rows[0] && rows[0].parentElement;
    rows.forEach(r=>container.appendChild(r));
    if(cityPaginationState){
      cityPaginationState.rows = rows;
      cityPaginationState.container = container;
      cityPaginationState.currentPage = 1;
    }
    refreshCityPagination();
    status.textContent='Sorted by distance.';
  }, ()=>{ status.textContent='Location permission denied.'; });
}

function initMap(){
  const shell = document.querySelector('.map-shell');
  const tooltip = document.getElementById('map-tooltip');
  if(!shell || !tooltip) return;
  const markers = shell.querySelectorAll('.map-marker');
  if(!markers.length) return;
  const cards = document.querySelectorAll('.city-card[data-city-card]');
  const cardLookup = {};
  cards.forEach(card=>{
    const name = card.getAttribute('data-city');
    if(name){ cardLookup[name] = card; }
  });
  const markerLookup = {};
  let hideTimer = null;
  const positionTooltip = (marker, evt)=>{
    const rect = shell.getBoundingClientRect();
    let x; let y;
    if(evt && typeof evt.clientX === 'number'){
      x = evt.clientX - rect.left;
      y = evt.clientY - rect.top;
    }else{
      const markerRect = marker.getBoundingClientRect();
      x = markerRect.left - rect.left + markerRect.width/2;
      y = markerRect.top - rect.top;
    }
    tooltip.style.left = x+'px';
    tooltip.style.top = y+'px';
  };
  const setTooltipContent = (marker)=>{
    const city = marker.getAttribute('data-city') || '';
    const count = marker.getAttribute('data-count') || '';
    tooltip.innerHTML = '<strong>'+city+'</strong><span>'+count+'</span>';
  };
  const activateCard = (cityName, active)=>{
    const card = cardLookup[cityName];
    if(card){ card.classList.toggle('is-highlighted', !!active); }
  };
  const activateMarker = (cityName, active)=>{
    const marker = markerLookup[cityName];
    if(marker){ marker.classList.toggle('is-active', !!active); }
  };
  const showTooltip = (marker, evt)=>{
    clearTimeout(hideTimer);
    setTooltipContent(marker);
    tooltip.style.opacity = '1';
    positionTooltip(marker, evt);
  };
  const hideTooltip = ()=>{
    hideTimer = setTimeout(()=>{ tooltip.style.opacity='0'; }, 120);
  };
  const goToCity = (marker)=>{
    const link = marker.getAttribute('data-link');
    if(link){ window.location.href = link; }
  };
  markers.forEach(marker=>{
    const cityName = marker.getAttribute('data-target-city');
    if(cityName){ markerLookup[cityName] = marker; }
    const enter = evt=>{
      showTooltip(marker, evt);
      if(cityName){
        activateCard(cityName,true);
        activateMarker(cityName,true);
      }
    };
    const leave = ()=>{
      hideTooltip();
      if(cityName){
        activateCard(cityName,false);
        activateMarker(cityName,false);
      }
    };
    marker.addEventListener('mouseenter', enter);
    marker.addEventListener('mouseleave', leave);
    marker.addEventListener('focus', enter);
    marker.addEventListener('blur', leave);
    marker.addEventListener('mousemove', evt=>showTooltip(marker, evt));
    marker.addEventListener('touchstart', evt=>enter(evt));
    marker.addEventListener('touchend', leave);
    marker.addEventListener('click', evt=>{ evt.preventDefault(); goToCity(marker); });
    marker.addEventListener('keydown', evt=>{
      if(evt.key==='Enter' || evt.key===' '){
        evt.preventDefault();
        goToCity(marker);
      }
    });
  });
  cards.forEach(card=>{
    const cityName = card.getAttribute('data-city');
    if(!cityName) return;
    card.addEventListener('mouseenter', ()=>activateMarker(cityName,true));
    card.addEventListener('mouseleave', ()=>activateMarker(cityName,false));
    card.addEventListener('focusin', ()=>activateMarker(cityName,true));
    card.addEventListener('focusout', ()=>activateMarker(cityName,false));
  });
}

function initCityPagination(){
  const container = document.querySelector('[data-provider-list]');
  const paginationEl = document.querySelector('[data-pagination]');
  if(!container || !paginationEl){
    cityPaginationState = null;
    return;
  }
  const rows = Array.from(container.querySelectorAll('[data-provider]'));
  if(!rows.length){
    paginationEl.style.display='none';
    cityPaginationState = null;
    return;
  }
  const sizeAttr = parseInt(container.getAttribute('data-page-size')||'25', 10);
  const pageSize = Number.isFinite(sizeAttr) && sizeAttr>0 ? sizeAttr : 25;
  const infoEl = paginationEl.querySelector('[data-page-info]');
  const prevBtn = paginationEl.querySelector('[data-page-prev]');
  const nextBtn = paginationEl.querySelector('[data-page-next]');
  rows.forEach(row=>{ if(!row.dataset.match){ row.dataset.match='true'; } });
  cityPaginationState = {
    container,
    rows,
    pageSize,
    currentPage:1,
    paginationEl,
    infoEl,
    prevBtn,
    nextBtn
  };
  const apply = ()=>{
    const matched = cityPaginationState.rows.filter(row=>row.dataset.match !== 'false');
    const total = matched.length;
    const totalPages = Math.max(1, Math.ceil(total / cityPaginationState.pageSize));
    if(cityPaginationState.currentPage > totalPages){ cityPaginationState.currentPage = totalPages; }
    if(cityPaginationState.currentPage < 1){ cityPaginationState.currentPage = 1; }
    cityPaginationState.rows.forEach(row=>{
      if(row.dataset.match === 'false'){ row.style.display='none'; }
    });
    const start = (cityPaginationState.currentPage - 1) * cityPaginationState.pageSize;
    const end = start + cityPaginationState.pageSize;
    matched.forEach((row, idx)=>{
      row.style.display = (idx >= start && idx < end) ? '' : 'none';
    });
    if(cityPaginationState.infoEl){
      if(total === 0){
        cityPaginationState.infoEl.textContent = 'No providers match your filters yet.';
      }else{
        const displayStart = start + 1;
        const displayEnd = Math.min(end, total);
        cityPaginationState.infoEl.textContent = `Showing ${displayStart}\u2013${displayEnd} of ${total} providers`;
      }
    }
    if(cityPaginationState.prevBtn){
      cityPaginationState.prevBtn.disabled = cityPaginationState.currentPage <= 1 || total <= 0;
    }
    if(cityPaginationState.nextBtn){
      cityPaginationState.nextBtn.disabled = cityPaginationState.currentPage >= totalPages || total <= 0;
    }
    cityPaginationState.paginationEl.style.display = 'flex';
  };
  cityPaginationState.apply = apply;
  const scrollToList = ()=>{
    const heading = cityPaginationState.container.previousElementSibling;
    if(heading && /^h[1-6]$/i.test(heading.tagName)){
      heading.scrollIntoView({behavior:'smooth', block:'start'});
    }else{
      cityPaginationState.container.scrollIntoView({behavior:'smooth', block:'start'});
    }
  };
  if(prevBtn){
    prevBtn.addEventListener('click', ()=>{
      if(cityPaginationState.currentPage > 1){
        cityPaginationState.currentPage--;
        apply();
        scrollToList();
      }
    });
  }
  if(nextBtn){
    nextBtn.addEventListener('click', ()=>{
      const matchedCount = cityPaginationState.rows.filter(row=>row.dataset.match !== 'false').length;
      const totalPages = Math.max(1, Math.ceil(matchedCount / cityPaginationState.pageSize));
      if(cityPaginationState.currentPage < totalPages){
        cityPaginationState.currentPage++;
        apply();
        scrollToList();
      }
    });
  }
  apply();
}

function refreshCityPagination(){
  if(cityPaginationState && typeof cityPaginationState.apply === 'function'){
    cityPaginationState.apply();
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  initMap();
  initCityPagination();
});
