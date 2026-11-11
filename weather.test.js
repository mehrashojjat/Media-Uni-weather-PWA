const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Element {
  constructor() {
    this.children = [];
    this.hidden = false;
    this.textContent = "";
    this.style = {};
    this.listeners = {};
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener(name, callback) { this.listeners[name] = callback; }
  contains() { return false; }
}

function setup(fetch) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    createElement() { return new Element(); },
    addEventListener() {}
  };
  const context = vm.createContext({
    document, fetch, AbortController, URLSearchParams, Intl, setTimeout, clearTimeout,
    setInterval() {}
  });
  vm.runInContext(fs.readFileSync(`${__dirname}/weather.js`, "utf8"), context);
  return { context, get: (id) => document.getElementById(id) };
}

function forecast() {
  return {
    timezone_abbreviation: "CET",
    current: { time: "2026-11-11T22:15", temperature_2m: 42, relative_humidity_2m: 80,
      apparent_temperature: 39, is_day: 0, weather_code: 0, wind_speed_10m: 7,
      wind_direction_10m: 315, uv_index: 0 },
    hourly: {
      time: ["2026-11-11T22:00", "2026-11-11T23:00", "2026-11-12T00:00",
        "2026-11-12T01:00", "2026-11-12T02:00", "2026-11-12T03:00", "2026-11-12T04:00"],
      temperature_2m: [42, 41, 40, 39, 38, 37, 36], weather_code: [0, 0, 0, 0, 0, 0, 0],
      is_day: [0, 0, 0, 0, 0, 0, 0]
    },
    daily: {
      time: ["2026-11-11", "2026-11-12"], weather_code: [0, 3],
      temperature_2m_min: [30, 32], temperature_2m_max: [50, 51]
    }
  };
}

const response = (data) => ({ ok: true, json: async () => data });
const berlin = { name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.41 };

test("city selection loads forecasts with local hours and selected coordinates", async () => {
  const requests = [];
  const { context, get } = setup(async (url) => {
    requests.push(url);
    if (url.includes("geocoding-api")) return response({ results: [berlin] });
    if (url.includes("air-quality-api")) return response({ current: { us_aqi: 42 } });
    return response(forecast());
  });
  await context.searchCities("Berlin", true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(get("location").textContent, "Berlin, Germany");
  assert.equal(get("temperature").textContent, 42);
  assert.equal(get("hourly").children.length, 7);
  assert.equal(get("hourly").children[2].children[0].textContent, "12 AM");
  assert.equal(get("daily").children.length, 2);
  assert.equal(get("air-quality-label").textContent, "Good · US AQI");
  assert.ok(requests.some((url) => url.includes("latitude=52.52") && url.includes("temperature_unit=fahrenheit")));
});

test("empty search and independent air quality failure are shown", async () => {
  const { context, get } = setup(async (url) => {
    if (url.includes("geocoding-api")) return response({});
    if (url.includes("air-quality-api")) throw new Error("offline");
    return response(forecast());
  });
  await context.searchCities("unknown");
  assert.equal(get("search-status").textContent, "No cities found.");
  await context.loadWeather(berlin);
  assert.equal(get("forecast").hidden, false);
  assert.equal(get("air-quality").textContent, "Unavailable");
});

test("forecast errors hide stale data and report failure", async () => {
  let fail = false;
  const { context, get } = setup(async (url) => {
    if (url.includes("air-quality-api")) return response({ current: { us_aqi: 42 } });
    if (fail) throw new Error("offline");
    return response(forecast());
  });
  await context.loadWeather(berlin);
  assert.equal(get("forecast").hidden, false);
  fail = true;
  await context.loadWeather(berlin);
  assert.equal(get("forecast").hidden, true);
  assert.match(get("weather-status").textContent, /Could not load weather/);
});

test("a late forecast cannot overwrite a newer location", async () => {
  let resolveOld;
  const { context, get } = setup(async (url) => {
    if (url.includes("air-quality-api")) return response({ current: { us_aqi: 42 } });
    if (url.includes("latitude=1")) {
      return new Promise((resolve) => { resolveOld = resolve; });
    }
    return response(forecast());
  });
  const oldRequest = context.loadWeather({ name: "Old", latitude: 1, longitude: 1 });
  await context.loadWeather(berlin);
  resolveOld(response(forecast()));
  await oldRequest;
  assert.equal(get("location").textContent, "Berlin, Germany");
});
