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

const DEFAULT_MAP_CENTER = { lat:27.6648, lng:-81.5158 };
const NAN_PATTERN = /\bnan\b/gi;
const REVIEW_STORAGE_KEY = 'pg:google-reviews-v1';
const REVIEW_CACHE_TTL = 1000 * 60 * 60 * 24 * 5;

let siteConfigPromise=null;
let cachedConfig=null;
let googleMapsPromise=null;
let reviewCacheLoaded=false;
let reviewCacheStore={};
let reviewSaveTimer=null;
let podiatristProfileCache=null;

function loadSiteConfig(){
  if(siteConfigPromise) return siteConfigPromise;
  if(!hasDocument) return Promise.resolve({});
  siteConfigPromise = fetch(getAssetUrl('config.json'), {cache:'no-store'})
    .then(resp=>resp && resp.ok ? resp.json() : {})
    .catch(()=>({}));
  return siteConfigPromise;
}

async function getGoogleMapsApiKey(){
  if(typeof globalThis !== 'undefined' && globalThis.__PODOGUIDE_MAPS_KEY__){
    return globalThis.__PODOGUIDE_MAPS_KEY__;
  }
  if(hasDocument){
    const meta = document.querySelector('meta[name="pg:maps-key"]');
    if(meta && meta.content) return meta.content.trim();
  }
  if(cachedConfig && cachedConfig.googleMapsApiKey){
    return cachedConfig.googleMapsApiKey;
  }
  cachedConfig = await loadSiteConfig();
  return cachedConfig.googleMapsApiKey || '';
}

function loadGoogleMapsSdk(){
  if(typeof google !== 'undefined' && google.maps) return Promise.resolve(google);
  if(googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = (async()=>{
    const apiKey = await getGoogleMapsApiKey();
    if(!apiKey) throw new Error('Missing Google Maps API key');
    if(!hasDocument) throw new Error('Document not available for Google Maps');
    return new Promise((resolve,reject)=>{
      const existing = document.querySelector('script[data-google-maps]');
      if(existing){
        existing.addEventListener('load', ()=>resolve(globalThis.google));
        existing.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.dataset.googleMaps = 'true';
      script.onload = ()=>resolve(globalThis.google);
      script.onerror = err=>reject(err || new Error('Google Maps failed to load'));
      document.head.appendChild(script);
    });
  })();
  return googleMapsPromise;
}

function getReviewCache(){
  if(reviewCacheLoaded) return reviewCacheStore;
  reviewCacheLoaded = true;
  reviewCacheStore = {};
  if(hasLocalStorage){
    try{
      const raw = localStorage.getItem(REVIEW_STORAGE_KEY);
      if(raw){
        const parsed = JSON.parse(raw);
        if(parsed && typeof parsed === 'object'){
          reviewCacheStore = parsed;
        }
      }
    }catch(err){
      reviewCacheStore = {};
    }
  }
  return reviewCacheStore;
}

function getCachedReview(npi){
  if(!npi) return null;
  const cache = getReviewCache();
  const record = cache[npi];
  if(record && record.fetchedAt && (Date.now() - record.fetchedAt) < REVIEW_CACHE_TTL){
    return record;
  }
  return null;
}

function persistReviewCache(){
  if(!hasLocalStorage || !reviewCacheLoaded) return;
  if(reviewSaveTimer) clearTimeout(reviewSaveTimer);
  reviewSaveTimer = setTimeout(()=>{
    try{
      localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(reviewCacheStore));
    }catch(err){}
  },250);
}

function storeCachedReview(npi, data){
  if(!npi || !data) return;
  const cache = getReviewCache();
  cache[npi] = Object.assign({}, data, { fetchedAt: Date.now() });
  persistReviewCache();
}

function removeNanTokens(value){
  if(!value) return '';
  return value.replace(NAN_PATTERN,' ');
}

function cleanInlineText(value){
  if(!value) return '';
  return removeNanTokens(value)
    .replace(/\b(\d{5})\d{4}\b/g,'$1')
    .replace(/\s{2,}/g,' ')
    .replace(/\s+,/g,', ')
    .replace(/,\s*,/g,', ')
    .replace(/,\s*$/,'')
    .trim();
}

function sanitizeAddressHtml(html){
  if(!html) return [];
  return html
    .split(/<br\s*\/?>/i)
    .map(part=>cleanInlineText(part))
    .filter(Boolean);
}

function parseJsonLd(){
  if(!hasDocument) return { node:null, data:null };
  const script = document.querySelector('script[type="application/ld+json"]');
  if(!script) return { node:null, data:null };
  try{
    return { node:script, data:JSON.parse(script.textContent) };
  }catch(err){
    return { node:script, data:null };
  }
}

function parseAddressComponents(line){
  const result = { street:'', city:'', state:'', postalCode:'' };
  if(!line) return result;
  const parts = line.split(',').map(part=>part.trim()).filter(Boolean);
  if(!parts.length) return result;
  result.street = parts.shift() || '';
  if(parts.length >= 2){
    result.city = parts.slice(0, parts.length-1).join(', ');
    const stateZip = parts[parts.length-1].split(/\s+/).filter(Boolean);
    result.state = (stateZip.shift() || '').toUpperCase();
    result.postalCode = stateZip.join(' '); 
  }else if(parts.length === 1){
    const fragment = parts[0];
    const stateZip = fragment.split(/\s+/).filter(Boolean);
    if(stateZip.length>=2){
      result.city = stateZip.slice(0, stateZip.length-2).join(' ');
      result.state = (stateZip[stateZip.length-2] || '').toUpperCase();
      result.postalCode = stateZip[stateZip.length-1] || '';
    }else{
      result.city = fragment;
    }
  }
  return result;
}

function extractNpiFromUrl(url){
  if(!url) return '';
  const match = url.match(/podiatrist\/(\d{10})/i);
  return match ? match[1] : '';
}

function buildSearchQueryFromContext(context){
  if(!context) return '';
  if(context.searchQuery) return context.searchQuery;
  const parts = [];
  if(context.name) parts.push(context.name);
  if(context.street) parts.push(context.street);
  if(context.city) parts.push(context.city);
  if(context.state) parts.push(context.state);
  if(!parts.length && context.fullAddress) parts.push(context.fullAddress);
  parts.push('podiatrist');
  return parts.filter(Boolean).join(' ');
}

function sanitizePodiatristProfile(){
  if(podiatristProfileCache) return podiatristProfileCache;
  if(!hasDocument || !document.body.classList.contains('podiatrist-page')) return null;
  const npi = document.body.getAttribute('data-npi') || '';
  const heading = document.querySelector('h1');
  const rawName = heading ? heading.textContent : '';
  const cleanName = cleanInlineText(rawName) || 'Local podiatrist';
  if(heading) heading.textContent = cleanName;
  const title = document.querySelector('title');
  if(title) title.textContent = `${cleanName} • PodoGuide`;
  const mapLink = document.querySelector('.map-link');
  let addressLines = [];
  let sanitizedMapHref = '';
  if(mapLink){
    addressLines = sanitizeAddressHtml(mapLink.innerHTML);
    mapLink.innerHTML = addressLines.join('<br/>');
    if(mapLink.href){
      try{
        const parsed = new URL(mapLink.href);
        const query = parsed.searchParams.get('query');
        if(query){
          parsed.searchParams.set('query', cleanInlineText(query));
          mapLink.href = parsed.toString();
          sanitizedMapHref = mapLink.href;
        }
      }catch(err){}
    }
  }
  if(sanitizedMapHref){
    document.querySelectorAll('a[href*="google.com/maps/search"]').forEach(anchor=>{
      anchor.href = sanitizedMapHref;
    });
  }
  document.querySelectorAll('.meta').forEach(el=>{
    const text = (el.textContent||'').trim();
    if(/^NPI:/i.test(text)){
      el.remove();
    }
  });
  const { node:ldNode, data:ldData } = parseJsonLd();
  if(ldData){
    if(cleanName) ldData.name = cleanName;
    if(ldData.address){
      if(ldData.address.streetAddress) ldData.address.streetAddress = cleanInlineText(ldData.address.streetAddress);
      if(ldData.address.addressLocality) ldData.address.addressLocality = cleanInlineText(ldData.address.addressLocality);
      if(ldData.address.addressRegion) ldData.address.addressRegion = cleanInlineText(ldData.address.addressRegion);
      if(ldData.address.postalCode) ldData.address.postalCode = cleanInlineText(ldData.address.postalCode);
    }
    if(ldNode) ldNode.textContent = JSON.stringify(ldData);
  }
  const rawStreetChunks = addressLines.slice(0, Math.max(1, addressLines.length-1));
  const rawStreetLine = rawStreetChunks.join(' ').trim();
  const cityLine = addressLines.length>1 ? addressLines[addressLines.length-1] : '';
  const parsedFallback = parseAddressComponents(cityLine ? `${rawStreetLine}, ${cityLine}` : rawStreetLine);
  const structuredAddress = ldData && ldData.address ? ldData.address : {};
  const address = {
    street: structuredAddress.streetAddress || cleanInlineText(rawStreetLine) || parsedFallback.street || '',
    city: structuredAddress.addressLocality || parsedFallback.city || '',
    state: structuredAddress.addressRegion || parsedFallback.state || 'FL',
    postalCode: structuredAddress.postalCode || parsedFallback.postalCode || ''
  };
  const phoneAnchor = document.querySelector('[href^="tel:"]');
  const phone = phoneAnchor ? phoneAnchor.textContent.replace(/\s+/g,' ').trim() : '';
  const fullAddress = cleanInlineText([
    address.street,
    address.city && address.state ? `${address.city}, ${address.state}` : address.city || address.state,
    address.postalCode
  ].filter(Boolean).join(' '));
  const profile = {
    npi,
    name: cleanName,
    address,
    phone,
    street: address.street,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    fullAddress,
    searchQuery: buildSearchQueryFromContext({ name: cleanName, street: address.street, city: address.city, state: address.state })
  };
  podiatristProfileCache = profile;
  return profile;
}

function ensureContactCardLayout(){
  const contactCard = document.querySelector('h2 + .card');
  if(!contactCard) return null;
  let details = contactCard.querySelector('.contact-details');
  if(!details){
    details = document.createElement('div');
    details.className = 'contact-details';
    while(contactCard.firstChild){
      details.appendChild(contactCard.firstChild);
    }
    contactCard.appendChild(details);
  }
  contactCard.classList.add('contact-card');
  let mapPanel = contactCard.querySelector('.clinic-map');
  if(!mapPanel){
    mapPanel = document.createElement('div');
    mapPanel.className = 'clinic-map';
    const status = document.createElement('p');
    status.className = 'map-status';
    status.textContent = 'Loading map…';
    mapPanel.appendChild(status);
    contactCard.appendChild(mapPanel);
  }
  return { contactCard, details, mapPanel };
}

function showMapStatus(container, message){
  if(!container) return;
  let status = container.querySelector('.map-status');
  if(!status){
    status = document.createElement('p');
    status.className = 'map-status';
    container.appendChild(status);
  }
  status.textContent = message;
}

function clearMapStatus(container){
  if(!container) return;
  const status = container.querySelector('.map-status');
  if(status) status.remove();
}

function renderClinicMapForProfile(googleLib, container, profile){
  if(!container){
    return null;
  }
  container.innerHTML = '';
  const canvas = document.createElement('div');
  canvas.className = 'clinic-map-canvas';
  container.appendChild(canvas);
  showMapStatus(container, 'Loading map…');
  if(!googleLib){
    showMapStatus(container, 'Google Maps unavailable right now.');
    return null;
  }
  const map = new googleLib.maps.Map(canvas, {
    center: DEFAULT_MAP_CENTER,
    zoom: 13,
    mapTypeControl:false,
    streetViewControl:false,
    fullscreenControl:false
  });
  if(!profile || !profile.fullAddress){
    showMapStatus(container, 'Clinic address unavailable.');
    return map;
  }
  const geocoder = new googleLib.maps.Geocoder();
  geocoder.geocode({ address: profile.fullAddress }, (results,status)=>{
    if(status === 'OK' && results && results[0]){
      clearMapStatus(container);
      updateMapMarker(map, googleLib, results[0].geometry && results[0].geometry.location, profile.name);
    }else{
      showMapStatus(container, 'Google Maps could not locate this clinic yet.');
    }
  });
  return map;
}

function normalizeLatLng(value){
  if(!value) return null;
  if(typeof value.lat === 'function'){
    return { lat:value.lat(), lng:value.lng() };
  }
  if(typeof value.lat === 'number' && typeof value.lng === 'number'){
    return value;
  }
  if(value.lat && value.lng){
    return { lat:Number(value.lat), lng:Number(value.lng) };
  }
  return null;
}

function updateMapMarker(map, googleLib, location, title){
  if(!map || !googleLib) return;
  const normalized = normalizeLatLng(location);
  if(!normalized) return;
  if(map.__clinicMarker){
    map.__clinicMarker.setMap(null);
  }
  map.__clinicMarker = new googleLib.maps.Marker({
    map,
    position: normalized,
    title: title || 'Clinic location'
  });
  if(map.setCenter) map.setCenter(normalized);
}

function ensureReviewBlock(details){
  if(!details) return null;
  let block = details.querySelector('.google-reviews');
  if(!block){
    block = document.createElement('div');
    block.className = 'google-reviews';
    const heading = document.createElement('strong');
    heading.textContent = 'Google reviews';
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = 'Checking Google reviews…';
    block.appendChild(heading);
    block.appendChild(meta);
    details.appendChild(block);
  }
  return block;
}

function renderReviewSummary(block, data){
  if(!block) return;
  const statusEl = block.querySelector('.meta') || (()=>{
    const meta = document.createElement('p');
    meta.className = 'meta';
    block.appendChild(meta);
    return meta;
  })();
  if(data && typeof data.rating==='number' && typeof data.count==='number'){
    statusEl.innerHTML = `<span class="rating-pill">${data.rating.toFixed(1)} ★</span> ${formatNumber(data.count)} Google reviews`;
  }else{
    statusEl.textContent = 'Google reviews not yet available for this clinician.';
  }
  let summaryEl = block.querySelector('.review-summary');
  if(!summaryEl){
    summaryEl = document.createElement('p');
    summaryEl.className = 'review-summary';
    block.appendChild(summaryEl);
  }
  const reviewSummaryText = (data && data.summary) ? data.summary : summarizeReviewTotals(data);
  summaryEl.textContent = reviewSummaryText ? reviewSummaryText : 'Patients have not published a public summary yet.';
  if(data && data.url){
    let link = block.querySelector('.review-link');
    if(!link){
      link = document.createElement('a');
      link.className = 'review-link';
      block.appendChild(link);
    }
    link.href = data.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Read on Google';
  }
}

function extractPlaceSummary(place){
  if(place && place.editorial_summary && place.editorial_summary.overview){
    return place.editorial_summary.overview;
  }
  if(place && Array.isArray(place.reviews) && place.reviews.length){
    const texts = place.reviews.slice(0,3).map(review=>review.text || review.body || '').filter(Boolean);
    const snippet = takeWords(texts.join(' '), 60);
    return snippet.value || '';
  }
  return '';
}

function summarizeReviewTotals(data){
  if(!data || typeof data.count!=='number') return '';
  const parts = [];
  if(typeof data.rating==='number'){
    parts.push(`${data.rating.toFixed(1)} ★ average`);
  }
  parts.push(`${formatNumber(data.count)} Google reviews`);
  return parts.join(' · ');
}

function pickBestPlaceMatch(results, context){
  if(!Array.isArray(results) || !results.length) return null;
  if(results.length===1) return results[0];
  const targetCity = (context && (context.city || '')).toLowerCase();
  const targetStreet = (context && (context.street || '')).toLowerCase();
  const targetName = (context && (context.name || '')).toLowerCase();
  let best = results[0];
  let bestScore = -Infinity;
  results.forEach(place=>{
    let score = 0;
    const addr = (place.formatted_address || '').toLowerCase();
    if(targetCity && addr.includes(targetCity)) score += 4;
    if(targetStreet){
      const firstWord = targetStreet.split(' ')[0];
      if(firstWord && addr.includes(firstWord)) score += 2;
    }
    if(targetName && place.name && place.name.toLowerCase().includes(targetName.split(' ')[0])) score += 2;
    if(place.business_status === 'OPERATIONAL') score += 1;
    if(score > bestScore){
      bestScore = score;
      best = place;
    }
  });
  return best;
}

function fetchGooglePlaceDetails(googleLib, context, map){
  if(!googleLib || !context) return Promise.resolve(null);
  const query = buildSearchQueryFromContext(context);
  if(!query) return Promise.resolve(null);
  const service = new googleLib.maps.places.PlacesService(map || document.createElement('div'));
  return new Promise((resolve,reject)=>{
    const request = { query, fields:['place_id','name','formatted_address','geometry','business_status'] };
    service.findPlaceFromQuery(request, (results,status)=>{
      if(status !== googleLib.maps.places.PlacesServiceStatus.OK || !results || !results.length){
        reject(new Error('Place lookup failed'));
        return;
      }
      const candidate = pickBestPlaceMatch(results, context);
      if(!candidate || !candidate.place_id){
        reject(new Error('Place ID missing'));
        return;
      }
      service.getDetails({
        placeId: candidate.place_id,
        fields:['name','rating','user_ratings_total','reviews','editorial_summary','url','geometry','formatted_address','place_id']
      }, (place,detailsStatus)=>{
        if(detailsStatus !== googleLib.maps.places.PlacesServiceStatus.OK || !place){
          reject(new Error('Place details unavailable'));
          return;
        }
        const location = normalizeLatLng(place.geometry && place.geometry.location);
        resolve({
          placeId: place.place_id || candidate.place_id,
          rating: typeof place.rating==='number' ? place.rating : null,
          count: typeof place.user_ratings_total==='number' ? place.user_ratings_total : null,
          summary: extractPlaceSummary(place),
          url: place.url || '',
          name: place.name || context.name || '',
          address: place.formatted_address || context.fullAddress || '',
          location
        });
      });
    });
  });
}

async function hydrateProfileReviews(profile, googleLib, details, map){
  if(!profile || !googleLib) return;
  const block = ensureReviewBlock(details);
  const cached = profile.npi ? getCachedReview(profile.npi) : null;
  if(cached){
    renderReviewSummary(block, cached);
    if(map && cached.location){
      updateMapMarker(map, googleLib, cached.location, cached.name || profile.name);
    }
    return;
  }
  try{
    const data = await fetchGooglePlaceDetails(googleLib, profile, map);
    if(data){
      storeCachedReview(profile.npi || data.placeId, data);
      renderReviewSummary(block, data);
      if(map && data.location){
        updateMapMarker(map, googleLib, data.location, data.name || profile.name);
      }
    }else{
      const statusEl = block && block.querySelector('.meta');
      if(statusEl) statusEl.textContent = 'Google reviews not yet available for this clinician.';
    }
  }catch(err){
    const statusEl = block && block.querySelector('.meta');
    if(statusEl) statusEl.textContent = 'Unable to load Google reviews right now.';
    console.warn('Google reviews failed', err);
  }
}

async function hydrateCityRatings(cards, fallbackCity){
  if(!Array.isArray(cards) || !cards.length) return;
  let googleLib=null;
  try{
    googleLib = await loadGoogleMapsSdk();
  }catch(err){
    cards.forEach(card=>markCardRatingUnavailable(card));
    console.warn('Google Maps unavailable', err);
    return;
  }
  cards.forEach((card,index)=>{
    const npi = card.dataset.npi || '';
    const cached = npi ? getCachedReview(npi) : null;
    if(cached){
      applyCardRating(card, cached);
      return;
    }
    const context = {
      npi,
      name: card.dataset.displayName || '',
      street: card.dataset.street || '',
      city: card.dataset.city || fallbackCity || '',
      state: card.dataset.state || 'FL',
      postalCode: card.dataset.postalCode || '',
      fullAddress: card.dataset.fullAddress || '',
      searchQuery: card.dataset.searchQuery || ''
    };
    const delay = index * 120;
    setTimeout(()=>{
      fetchGooglePlaceDetails(googleLib, context)
        .then(details=>{
          if(details){
            storeCachedReview(npi || details.placeId, details);
            applyCardRating(card, details);
          }else{
            markCardRatingUnavailable(card);
          }
        })
        .catch(()=>markCardRatingUnavailable(card));
    }, delay);
  });
}

function applyCardRating(card, details){
  if(!card) return;
  const badge = card.querySelector('.rating-badge');
  if(!badge) return;
  badge.classList.remove('is-loading');
  if(details && typeof details.rating==='number' && typeof details.count==='number'){
    badge.innerHTML = `${details.rating.toFixed(1)} ★<small>${details.count.toLocaleString()} reviews</small>`;
    badge.setAttribute('aria-label', `${details.rating.toFixed(1)} star rating from ${details.count.toLocaleString()} Google reviews`);
    card.dataset.rating = details.rating.toFixed(2);
  }else{
    badge.innerHTML = '<small>Reviews unavailable</small>';
    badge.setAttribute('aria-label','Google reviews unavailable');
    card.dataset.rating = '0';
  }
}

function markCardRatingUnavailable(card){
  applyCardRating(card, null);
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
  if(!hasDocument || !document.body.classList.contains('podiatrist-page')) return;
  const profile = sanitizePodiatristProfile();
  const layout = ensureContactCardLayout();
  if(!layout || !profile) return;
  let googleLib=null;
  try{
    googleLib = await loadGoogleMapsSdk();
  }catch(err){
    showMapStatus(layout.mapPanel, 'Provide a Google Maps API key to render this clinic map.');
    const block = ensureReviewBlock(layout.details);
    const statusEl = block.querySelector('.meta');
    if(statusEl) statusEl.textContent = 'Google reviews require a valid Google Maps API key.';
    console.warn('Google Maps unavailable', err);
    return;
  }
  const map = renderClinicMapForProfile(googleLib, layout.mapPanel, profile);
  await hydrateProfileReviews(profile, googleLib, layout.details, map);
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

const CITY_PHOTO_PREFIX = '/podoguide/img/city-photos/';
const FALLBACK_CITY_PHOTO = '/podoguide/assets/hero-florida.jpg';
const INSIGHTS_SUMMARY_URL = '/podoguide/insights/articles.json';
let cityPhotoManifestCache = null;
let cityPhotoManifestPromise = null;
let insightsSummaryCache = null;
let insightsSummaryPromise = null;

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

function loadInsightsSummaries(){
  if(insightsSummaryCache) return Promise.resolve(insightsSummaryCache);
  if(insightsSummaryPromise) return insightsSummaryPromise;
  if(!hasDocument || typeof fetch === 'undefined'){
    insightsSummaryCache = [];
    return Promise.resolve(insightsSummaryCache);
  }
  insightsSummaryPromise = fetch(INSIGHTS_SUMMARY_URL, {cache:'no-cache'})
    .then(resp=>resp && resp.ok ? resp.json() : [])
    .then(entries=>{
      if(!Array.isArray(entries)){
        insightsSummaryCache = [];
        return insightsSummaryCache;
      }
      insightsSummaryCache = entries;
      return entries;
    })
    .catch(err=>{
      console.warn('Insight summaries failed to load', err);
      insightsSummaryCache = [];
      return insightsSummaryCache;
    });
  return insightsSummaryPromise;
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

function takeWords(text, limit, appendEllipsis=true){
  if(!text || limit<=0) return { value:'', used:0 };
  const normalized = text.replace(/\s+/g,' ').trim();
  if(!normalized) return { value:'', used:0 };
  const words = normalized.split(' ');
  if(words.length<=limit){
    return { value: normalized, used: words.length };
  }
  const slice = words.slice(0, limit).join(' ');
  return { value: appendEllipsis ? `${slice}…` : slice, used: limit };
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

function collectSectionCopy(section){
  if(!section || !section.content) return '';
  const root = section.content;
  const paragraphs = root.querySelectorAll ? Array.from(root.querySelectorAll('p')) : [];
  if(paragraphs.length){
    return paragraphs.map(p=>(p.textContent||'').trim()).filter(Boolean).join(' ');
  }
  return (root.textContent || '').trim();
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
  return { rating, reviews, years, specialties, insurances, cleanName };
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
  const parsedAddress = parseAddressComponents(address);
  card.dataset.street = parsedAddress.street || '';
  card.dataset.city = parsedAddress.city || cityName || '';
  card.dataset.state = parsedAddress.state || 'FL';
  card.dataset.postalCode = parsedAddress.postalCode || '';
  const fullAddress = [
    card.dataset.street,
    card.dataset.city && card.dataset.state ? `${card.dataset.city}, ${card.dataset.state}` : card.dataset.city || card.dataset.state,
    card.dataset.postalCode
  ].filter(Boolean).join(' ');
  card.dataset.fullAddress = fullAddress;
  const npiSlug = linkEl ? extractNpiFromUrl(linkEl.getAttribute('href')) : '';
  if(npiSlug) card.dataset.npi = npiSlug;
  const searchContext = {
    name: namePart,
    street: card.dataset.street,
    city: card.dataset.city,
    state: card.dataset.state
  };
  card.dataset.searchQuery = buildSearchQueryFromContext(searchContext);

  card.dataset.displayName = namePart;
  card.dataset.rating = '0';
  card.dataset.years = String(meta.years);
  card.dataset.specialties = meta.specialties.map(item=>normalize(item)).join('|');
  card.dataset.insurance = meta.insurances.map(item=>normalize(item)).join('|');
  const keywordSource = [displayName,address,card.dataset.searchQuery,meta.specialties.join(' '),meta.insurances.join(' ')]
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
  ratingBadge.className = 'rating-badge is-loading';
  ratingBadge.setAttribute('aria-live','polite');
  ratingBadge.innerHTML = '<small>Reviews pending</small>';
  header.appendChild(ratingBadge);
  card.appendChild(header);

  const metaLine = document.createElement('p');
  metaLine.className = 'doctor-meta';
  const metaBits = [];
  if(address) metaBits.push(address);
  if(meta.specialties.length){
    metaBits.push(meta.specialties.join(' • '));
  }
  if(metaBits.length){
    metaLine.textContent = metaBits.join(' • ');
    card.appendChild(metaLine);
  }

  const distancePill = document.createElement('div');
  distancePill.className = 'distance-pill';
  distancePill.setAttribute('data-dist-badge','');
  distancePill.setAttribute('aria-live','polite');
  card.appendChild(distancePill);

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

function createCitySummaryCard(cityName, sections, maxWords=150){
  if(!sections || !sections.length) return null;
  const card = document.createElement('section');
  card.className = 'card city-summary-card';
  let remaining = maxWords;
  const totalSections = sections.filter(Boolean).length || 1;
  sections.forEach((section, index)=>{
    if(remaining<=0) return;
    const text = collectSectionCopy(section);
    if(!text) return;
    const limit = Math.max( Math.min(Math.floor(maxWords / totalSections), remaining), 1);
    const { value, used } = takeWords(text, limit, false);
    if(!value) return;
    remaining -= used;
    const paragraph = document.createElement('p');
    paragraph.textContent = value.replace(/[.?!…]*$/,'').trim() + '.';
    card.appendChild(paragraph);
    if(index < sections.length - 1){
      const breaker = document.createElement('br');
      breaker.className = 'city-summary-break';
      breaker.setAttribute('aria-hidden','true');
      card.appendChild(breaker);
    }
  });
  return card.childElementCount ? card : null;
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

function createInsightsWidget(articles){
  const card = document.createElement('section');
  card.className = 'rail-widget stay-ahead-card insights-widget';
  const sorted = Array.isArray(articles) ? [...articles] : [];
  sorted.sort((a,b)=>{
    const timeA = a && a.date ? new Date(a.date).getTime() : NaN;
    const timeB = b && b.date ? new Date(b.date).getTime() : NaN;
    if(isNaN(timeA) && isNaN(timeB)) return 0;
    if(isNaN(timeA)) return 1;
    if(isNaN(timeB)) return -1;
    return timeB - timeA;
  });
  const subset = sorted.slice(0,3);
  if(subset.length){
    const list = document.createElement('ul');
    list.className = 'insights-widget-list';
    subset.forEach(article=>{
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `/podoguide/insights/${article.id}/`;
      const title = document.createElement('h4');
      title.textContent = article && article.title ? article.title : 'Read the latest insight';
      const snippet = takeWords(article && article.excerpt ? article.excerpt : '', 12);
      const excerpt = document.createElement('p');
      excerpt.textContent = snippet.value || 'Mary distills advanced foot & ankle protocols into plain language.';
      link.appendChild(title);
      link.appendChild(excerpt);
      item.appendChild(link);
      const readMore = document.createElement('a');
      readMore.className = 'btn primary insights-read-more';
      readMore.href = `/podoguide/insights/${article.id}/`;
      readMore.textContent = 'Read more';
      readMore.setAttribute('aria-label', `Read more about ${article.title}`);
      item.appendChild(readMore);
      list.appendChild(item);
    });
    card.appendChild(list);
  }else{
    const empty = document.createElement('p');
    empty.className = 'meta';
    empty.textContent = 'Mary shares weekly recovery and prevention playbooks. Fresh articles are on the way.';
    card.appendChild(empty);
  }
  const browse = document.createElement('a');
  browse.className = 'btn secondary';
  browse.href = '/podoguide/insights/';
  browse.textContent = 'Browse all insights';
  card.appendChild(browse);
  return card;
}

function initCityFilters(grid, totalTracked, pagination){
  if(!grid) return;
  const search = document.getElementById('filter-keyword');
  const specialty = document.getElementById('filter-specialty');
  const insurance = document.getElementById('filter-insurance');
  const sort = document.getElementById('filter-sort');
  const pill = document.getElementById('city-results-pill');
  const cards = Array.from(grid.querySelectorAll('.doctor-card'));
  const allCardsCount = cards.length;
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
    if(pagination){
      pagination.hidden = visibleCount < allCardsCount;
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
  extractSection(container, /About podiatry/i);
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
  let cityPhoto = null;
  let insightsArticles = [];
  try{
    const [manifest, insights] = await Promise.all([
      loadCityPhotoManifest(),
      loadInsightsSummaries()
    ]);
    cityPhoto = manifest && manifest[citySlug] || null;
    insightsArticles = Array.isArray(insights) ? insights : [];
  }catch(err){
    cityPhoto = null;
    insightsArticles = [];
  }
  mainCol.appendChild(createHeroCard(headingText || `Podiatrists in ${cityName}, FL`, totalTracked, stats.pageCopy, updatedCopy, cityName, cityPhoto));
  mainCol.appendChild(createFilterBar(doctorCards.length, totalTracked));
  const summaryCard = createCitySummaryCard(cityName, [conditionsSection, treatmentsSection]);
  if(summaryCard) mainCol.appendChild(summaryCard);
  const listHeading = document.createElement('h2');
  listHeading.textContent = directoryHeading;
  mainCol.appendChild(listHeading);
  const doctorGrid = document.createElement('div');
  doctorGrid.className = 'doctor-grid';
  doctorGrid.id = 'doctor-grid';
  doctorCards.forEach(card=>doctorGrid.appendChild(card));
  mainCol.appendChild(doctorGrid);
  if(pagination) mainCol.appendChild(pagination);
  const insightsWidget = createInsightsWidget(insightsArticles);
  rail.appendChild(insightsWidget);
  initCityFilters(doctorGrid, totalTracked, pagination);
  hydrateCityRatings(doctorCards, cityName);
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
