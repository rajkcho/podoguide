import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const sitePath = path.resolve(__dirname, '../assets/site.js');
const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

let initLeafletMap;
let circleMarkerMock;
let mapInstance;
let createdMarkers;
let geoJsonOptions;
let panes;

const sampleGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0]]]
      },
      properties: {}
    }
  ]
};

beforeEach(() => {
  const dom = new JSDOM(`<!doctype html><html><body><div id="popular-map" class="leaflet-map"></div></body></html>`, {
    url: 'https://example.com/podoguide/'
  });
  process.env.NODE_ENV = 'test';
  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(global, 'navigator', {
    value: dom.window.navigator,
    configurable: true
  });
  global.localStorage = {
    length: 0,
    key: vi.fn(),
    getItem: vi.fn(),
    setItem: vi.fn()
  };
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(sampleGeoJson)
  });

  const scrollWheel = {
    enable: vi.fn(),
    disable: vi.fn()
  };

  panes = {};
  mapInstance = {
    fitBounds: vi.fn(),
    scrollWheelZoom: scrollWheel,
    setMaxBounds: vi.fn(),
    setZoom: vi.fn(),
    getZoom: vi.fn(()=>5),
    options: {},
    createPane: vi.fn(name=>{
      panes[name] = { style:{} };
      return panes[name];
    }),
    getPane: vi.fn(name=>panes[name] || null)
  };

  createdMarkers = [];
  circleMarkerMock = vi.fn(() => {
    const markerApi = {
      addTo: vi.fn().mockReturnThis(),
      bindTooltip: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
      openTooltip: vi.fn(),
      closeTooltip: vi.fn(),
      getElement: vi.fn().mockReturnValue({
        setAttribute: vi.fn(),
        addEventListener: vi.fn()
      })
    };
    createdMarkers.push(markerApi);
    return markerApi;
  });

  geoJsonOptions = null;
  global.L = {
    map: vi.fn(() => mapInstance),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    circleMarker: circleMarkerMock,
    latLngBounds: coords => {
      const bounds = { coords };
      bounds.pad = vi.fn().mockReturnValue(bounds);
      return bounds;
    },
    geoJSON: vi.fn((data, options={}) => {
      geoJsonOptions = options;
      const bounds = {
        pad: vi.fn().mockReturnThis()
      };
      return {
        addTo: vi.fn().mockReturnThis(),
        getBounds: vi.fn(() => bounds),
        bringToBack: vi.fn()
      };
    })
  };

  delete require.cache[require.resolve(sitePath)];
  ({ initLeafletMap } = require(sitePath));
});

it('initializes Leaflet with the popular map element', async () => {
  initLeafletMap();
  expect(global.L.map).toHaveBeenCalledTimes(1);
  const targetEl = global.L.map.mock.calls[0][0];
  expect(targetEl.id).toBe('popular-map');
});

it('plots the top 30 city markers with tooltips', async () => {
  initLeafletMap();
  expect(circleMarkerMock).toHaveBeenCalledTimes(30);
});

it('fetches the Florida boundary GeoJSON and fits bounds', async () => {
  initLeafletMap();
  await flushPromises();
  await flushPromises();
  expect(global.fetch).toHaveBeenCalledWith('https://example.com/podoguide/assets/florida-boundary.geojson');
  expect(global.L.geoJSON).toHaveBeenCalled();
  expect(mapInstance.fitBounds).toHaveBeenCalled();
  expect(geoJsonOptions && geoJsonOptions.interactive).toBe(false);
  expect(geoJsonOptions && geoJsonOptions.pane).toBe('fl-boundary');
  expect(panes['fl-boundary'].style.pointerEvents).toBe('none');
  expect(mapInstance.setMaxBounds).toHaveBeenCalled();
  expect(mapInstance.setZoom).toHaveBeenCalledTimes(1);
  expect(mapInstance.setZoom).toHaveBeenCalledWith(6);
});

it('enables scroll zoom only after pointer focus', () => {
  initLeafletMap();
  const mapEl = document.getElementById('popular-map');
  mapEl.dispatchEvent(new window.Event('mouseenter'));
  expect(mapInstance.scrollWheelZoom.enable).toHaveBeenCalled();
  mapEl.dispatchEvent(new window.Event('mouseleave'));
  expect(mapInstance.scrollWheelZoom.disable).toHaveBeenCalledTimes(2);
});

it('registers click and hover handlers for every marker', () => {
  initLeafletMap();
  createdMarkers.forEach(marker=>{
    expect(marker.bindTooltip).toHaveBeenCalledTimes(1);
    const events = marker.on.mock.calls.map(call=>call[0]);
    expect(events).toContain('click');
    expect(events).toContain('mouseover');
    expect(events).toContain('mouseout');
  });
});
