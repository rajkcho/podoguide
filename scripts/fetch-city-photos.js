#!/usr/bin/env node
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { URLSearchParams } = require('node:url');
const process = require('node:process');

const cities = require('../assets/cities.json');

const API_ENDPOINT = 'https://api.pexels.com/v1/search';
const OUTPUT_DIR = path.resolve(__dirname, '../img/city-photos');
const MANIFEST_PATH = path.resolve(__dirname, '../assets/city-photos.json');
const HEADER = '[city-photos]';
const MAX_RATE_RETRIES = 5;
const BASE_RETRY_DELAY = 30000;

function getArgValue(flag){
  const arg = process.argv.find(item=>item.startsWith(`${flag}=`));
  if(arg){
    return arg.slice(flag.length+1);
  }
  return undefined;
}

function hasFlag(flag){
  return process.argv.includes(flag);
}

function synthesizeAlt(cityName){
  return `${cityName}, Florida skyline at sunset`;
}

function ensureApiKey(){
  const key = process.env.PEXELS_API_KEY;
  if(!key){
    throw new Error(`${HEADER} Missing PEXELS_API_KEY environment variable.`);
  }
  return key;
}

function buildSearchUrl(city){
  const params = new URLSearchParams({
    query: `${city} Florida skyline`,
    orientation: 'landscape',
    size: 'large',
    per_page: '1',
    locale: 'en-US'
  });
  return `${API_ENDPOINT}?${params.toString()}`;
}

function requestJson(url, headers){
  return new Promise((resolve,reject)=>{
    const req = https.request(url, { method:'GET', headers }, res=>{
      const chunks = [];
      res.on('data', chunk=>chunks.push(chunk));
      res.on('end', ()=>{
        const body = Buffer.concat(chunks).toString('utf8');
        if(res.statusCode && res.statusCode >= 400){
          const error = new Error(`${HEADER} Request failed for ${url} (${res.statusCode}): ${body}`);
          error.status = res.statusCode;
          error.body = body;
          return reject(error);
        }
        try{
          resolve(JSON.parse(body));
        }catch(err){
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function downloadPhoto(url, destination, redirectCount=0){
  return new Promise((resolve,reject)=>{
    https.get(url, res=>{
      if(res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
        res.resume();
        if(redirectCount > 4){
          return reject(new Error(`${HEADER} Too many redirects fetching ${url}`));
        }
        return resolve(downloadPhoto(res.headers.location, destination, redirectCount+1));
      }
      if(res.statusCode && res.statusCode >= 400){
        res.resume();
        return reject(new Error(`${HEADER} Unable to download ${url} (${res.statusCode})`));
      }
      const fileStream = fsSync.createWriteStream(destination);
      res.pipe(fileStream);
      fileStream.on('finish', ()=>fileStream.close(resolve));
      fileStream.on('error', err=>{
        fileStream.close(()=>{
          fsSync.rm(destination, { force:true }, ()=>{});
        });
        reject(err);
      });
    }).on('error', reject);
  });
}

const wait = ms => new Promise(resolve=>setTimeout(resolve, ms));

async function readManifest(){
  try{
    const raw = await fs.readFile(MANIFEST_PATH,'utf8');
    return JSON.parse(raw);
  }catch(err){
    if(err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeManifest(entries){
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(entries,null,2)}\n`, 'utf8');
}

async function main(){
  const apiKey = ensureApiKey();
  await fs.mkdir(OUTPUT_DIR,{recursive:true});
  const limit = Number(getArgValue('--limit')) || Infinity;
  const offset = Number(getArgValue('--offset')) || 0;
  const cityFilter = (getArgValue('--city') || '').toLowerCase();
  const force = hasFlag('--force');
  const dryRun = hasFlag('--dry-run');

  let manifest = await readManifest();
  const manifestMap = new Map(manifest.map(entry=>[entry.slug, entry]));

  const filteredCities = cities.filter(city=>{
    if(!cityFilter) return true;
    return city.slug === cityFilter || city.name.toLowerCase() === cityFilter;
  });

  if(!filteredCities.length){
    console.error(`${HEADER} No cities matched filter.`);
    return;
  }

  const startIndex = Math.max(0, offset);
  const endIndex = Number.isFinite(limit) ? startIndex + limit : filteredCities.length;
  const queue = filteredCities.slice(startIndex, endIndex);
  console.log(`${HEADER} Preparing ${queue.length} city photo request(s) starting at index ${startIndex}.`);

  for(const city of queue){
    if(!force && manifestMap.has(city.slug)){
      console.log(`${HEADER} ✓ ${city.name} already cached.`);
      continue;
    }
    console.log(`${HEADER} → Fetching Pexels image for ${city.name}…`);
    let response;
    let attempt = 0;
    while(attempt < MAX_RATE_RETRIES){
      try{
        response = await requestJson(buildSearchUrl(city.name), {
          Authorization: apiKey,
          Accept: 'application/json'
        });
        break;
      }catch(err){
        if(err.status === 429){
          attempt++;
          const delay = Math.min(BASE_RETRY_DELAY * attempt, 180000);
          console.warn(`${HEADER} ⚠︎ Rate limit hit while fetching ${city.name}. Waiting ${(delay/1000).toFixed(0)}s before retry ${attempt}/${MAX_RATE_RETRIES}.`);
          await wait(delay);
          continue;
        }
        console.error(`${HEADER} ✕ ${city.name}: ${err.message}`);
        response = null;
        break;
      }
    }
    if(!response){
      continue;
    }
    const photo = Array.isArray(response && response.photos) ? response.photos[0] : null;
    if(!photo){
      console.warn(`${HEADER} ⚠︎ No photo found for ${city.name}.`);
      continue;
    }
    const srcSet = photo.src || {};
    const downloadUrl = srcSet.large2x || srcSet.large || srcSet.original;
    if(!downloadUrl){
      console.warn(`${HEADER} ⚠︎ Missing download URL for ${city.name}.`);
      continue;
    }
    const filename = `${city.slug}-${photo.id}.jpg`;
    if(!dryRun){
      try{
        await downloadPhoto(downloadUrl, path.join(OUTPUT_DIR, filename));
      }catch(err){
        console.error(`${HEADER} ✕ Failed to download ${city.name}: ${err.message}`);
        continue;
      }
    }
    const entry = {
      slug: city.slug,
      city: city.name,
      file: filename,
      width: photo.width,
      height: photo.height,
      alt: photo.alt || synthesizeAlt(city.name),
      credit:{
        photographer: photo.photographer,
        url: photo.photographer_url
      },
      source: photo.url,
      downloadedAt: new Date().toISOString()
    };
    manifestMap.set(city.slug, entry);
  }

  const nextManifest = Array.from(manifestMap.values()).sort((a,b)=>a.slug.localeCompare(b.slug));
  if(!dryRun){
    await writeManifest(nextManifest);
    console.log(`${HEADER} Saved ${nextManifest.length} photo entries.`);
  }else{
    console.log(`${HEADER} Dry run complete. Manifest not updated.`);
  }
}

main().catch(err=>{
  console.error(`${HEADER} Unexpected failure`, err);
  process.exitCode = 1;
});
