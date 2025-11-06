function normalize(s){return (s||'').toLowerCase();}
function filterCities(){
  const q = normalize(document.getElementById('home-q').value);
  const options = document.querySelectorAll('#home-city-dd option');
  options.forEach((opt, idx)=>{
    if(idx===0){ opt.hidden=false; return; }
    const text = normalize(opt.textContent);
    opt.hidden = q && !text.includes(q);
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
    row.style.display = (okName && okGender) ? '' : 'none';
  });
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
    status.textContent='Sorted by distance.';
  }, ()=>{ status.textContent='Location permission denied.'; });
}

function initMap(){
  const shell = document.querySelector('.map-shell');
  const tooltip = document.getElementById('map-tooltip');
  if(!shell || !tooltip) return;
  const markers = shell.querySelectorAll('.map-marker');
  if(!markers.length) return;
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
    const enter = evt=>{
      showTooltip(marker, evt);
      marker.classList.add('is-active');
    };
    const leave = ()=>{
      hideTooltip();
      marker.classList.remove('is-active');
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
}

document.addEventListener('DOMContentLoaded', initMap);
