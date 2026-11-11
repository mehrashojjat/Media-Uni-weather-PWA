"use strict";

const $ = (id) => document.getElementById(id);
const searchInput = $("city-search");
const searchResults = $("search-results");
let searchController;
let weatherController;
let searchTimer;
let selectedLocation = { name: "Cupertino", admin1: "California", country: "United States", latitude: 37.323, longitude: -122.0322 };

function locationName(location) {
  return [location.name, location.admin1, location.country].filter(Boolean).join(", ");
}

function weatherDescription(code, isDay = true) {
  if (code === 0) return ["Clear", isDay ? "wb_sunny" : "nights_stay"];
  if (code === 1 || code === 2) return ["Partly cloudy", isDay ? "partly_cloudy_day" : "partly_cloudy_night"];
  if (code === 3) return ["Overcast", "cloud"];
  if (code === 45 || code === 48) return ["Fog", "foggy"];
  if ([51, 53, 55, 56, 57].includes(code)) return ["Drizzle", "rainy"];
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ["Rain", "rainy"];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ["Snow", "weather_snowy"];
  if ([95, 96, 99].includes(code)) return ["Thunderstorm", "thunderstorm"];
  return ["Conditions unavailable", "cloud"];
}

function displayNumber(value, suffix = "") {
  return Number.isFinite(value) ? `${Math.round(value)}${suffix}` : "Unavailable";
}

function localHour(time) {
  const hour = Number(time.slice(11, 13));
  return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}

function weekday(date) {
  return new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function icon(code, isDay) {
  const [description, symbol] = weatherDescription(code, isDay);
  const node = element("span", "material-symbols-outlined text-[24px] text-secondary", symbol);
  node.setAttribute("aria-label", description);
  node.setAttribute("role", "img");
  return node;
}

function renderForecast(data, location) {
  const { current, hourly, daily } = data;
  if (!current || !hourly || !daily || typeof current.time !== "string" ||
      !Array.isArray(hourly.time) || !Array.isArray(hourly.temperature_2m) ||
      !Array.isArray(hourly.weather_code) || !Array.isArray(hourly.is_day) ||
      !Array.isArray(daily.time) || !daily.time.length ||
      !Array.isArray(daily.weather_code) || !Array.isArray(daily.temperature_2m_max) ||
      !Array.isArray(daily.temperature_2m_min)) {
    throw new Error("Incomplete forecast response");
  }
  $("location").textContent = locationName(location);
  $("temperature").textContent = Number.isFinite(current.temperature_2m) ? Math.round(current.temperature_2m) : "—";
  $("conditions").textContent = weatherDescription(current.weather_code, current.is_day === 1)[0];
  $("high").textContent = displayNumber(daily.temperature_2m_max[0], "°");
  $("low").textContent = displayNumber(daily.temperature_2m_min[0], "°");
  $("updated").textContent = `Updated ${current.time.replace("T", " ")} ${data.timezone_abbreviation || "local time"}`;
  $("wind").textContent = displayNumber(current.wind_speed_10m, " mph");
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  $("wind-direction").textContent = Number.isFinite(current.wind_direction_10m)
    ? `${directions[Math.round(current.wind_direction_10m / 45) % 8]} wind` : "Direction unavailable";
  $("humidity").textContent = displayNumber(current.relative_humidity_2m, "%");
  $("feels-like").textContent = `Feels like ${displayNumber(current.apparent_temperature, "°F")}`;
  $("uv").textContent = Number.isFinite(current.uv_index) ? current.uv_index.toFixed(1) : "Unavailable";
  $("uv-label").textContent = !Number.isFinite(current.uv_index) ? "" :
    current.uv_index < 3 ? "Low" : current.uv_index < 6 ? "Moderate" :
    current.uv_index < 8 ? "High" : current.uv_index < 11 ? "Very high" : "Extreme";

  const hourlyContainer = $("hourly");
  hourlyContainer.replaceChildren();
  const now = element("div", "flex flex-col items-center gap-3 py-2 text-center rounded-2xl bg-surface-container-highest/40", "");
  now.append(element("span", "text-xs font-semibold", "Now"), icon(current.weather_code, current.is_day === 1),
    element("span", "text-base font-semibold", displayNumber(current.temperature_2m, "°")));
  hourlyContainer.append(now);
  const currentHour = `${current.time.slice(0, 13)}:00`;
  hourly.time.forEach((time, index) => {
    if (time <= currentHour || hourlyContainer.children.length >= 7) return;
    const item = element("div", "flex flex-col items-center gap-3 py-2 text-center", "");
    item.append(element("span", "text-xs text-on-surface-variant", localHour(time)),
      icon(hourly.weather_code[index], hourly.is_day[index] === 1),
      element("span", "text-base font-medium", displayNumber(hourly.temperature_2m[index], "°")));
    hourlyContainer.append(item);
  });

  const dailyContainer = $("daily");
  dailyContainer.replaceChildren();
  const validLows = daily.temperature_2m_min.filter(Number.isFinite);
  const validHighs = daily.temperature_2m_max.filter(Number.isFinite);
  const min = Math.min(...validLows);
  const max = Math.max(...validHighs);
  daily.time.slice(0, 7).forEach((date, index) => {
    const low = daily.temperature_2m_min[index];
    const high = daily.temperature_2m_max[index];
    const row = element("div", "flex items-center justify-between gap-3 text-sm py-0.5", "");
    const bar = element("div", "flex-1 h-1.5 rounded-full bg-surface-container relative", "");
    if (Number.isFinite(low) && Number.isFinite(high)) {
      const range = element("div", "absolute h-full rounded-full bg-gradient-to-r from-primary via-secondary to-secondary-container", "");
      const span = max - min;
      range.style.left = `${span > 0 ? Math.max(0, (low - min) / span * 100) : 0}%`;
      range.style.width = `${span > 0 ? Math.max(0, (high - low) / span * 100) : 100}%`;
      bar.append(range);
    }
    row.append(element("span", "w-14 text-on-surface-variant font-medium", index === 0 ? "Today" : weekday(date)),
      icon(daily.weather_code[index], true), element("span", "w-10 text-right text-xs text-outline", displayNumber(low, "°")),
      bar, element("span", "w-10 font-semibold", displayNumber(high, "°")));
    dailyContainer.append(row);
  });
  $("current-weather").hidden = false;
  $("forecast").hidden = false;
}

async function getJSON(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

async function loadWeather(location) {
  if (weatherController) weatherController.abort();
  const controller = new AbortController();
  weatherController = controller;
  $("current-weather").hidden = true;
  $("forecast").hidden = true;
  $("weather-status").textContent = `Loading weather for ${locationName(location)}...`;
  const params = new URLSearchParams({
    latitude: location.latitude, longitude: location.longitude, timezone: "auto",
    temperature_unit: "fahrenheit", wind_speed_unit: "mph", forecast_days: "7",
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,uv_index",
    hourly: "temperature_2m,weather_code,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min"
  });
  const airParams = new URLSearchParams({
    latitude: location.latitude, longitude: location.longitude, current: "us_aqi", timezone: "auto"
  });
  $("air-quality").textContent = "Loading";
  $("air-quality-label").textContent = "";
  const airPromise = getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?${airParams}`, controller.signal)
    .then((data) => {
      if (controller.signal.aborted) return;
      const aqi = data.current?.us_aqi;
      $("air-quality").textContent = displayNumber(aqi);
      $("air-quality-label").textContent = !Number.isFinite(aqi) ? "US AQI unavailable" :
        aqi <= 50 ? "Good · US AQI" : aqi <= 100 ? "Moderate · US AQI" :
        aqi <= 150 ? "Unhealthy for sensitive groups · US AQI" : aqi <= 200 ? "Unhealthy · US AQI" :
        aqi <= 300 ? "Very unhealthy · US AQI" : "Hazardous · US AQI";
    })
    .catch((error) => {
      if (error.name === "AbortError" || controller.signal.aborted) return;
      $("air-quality").textContent = "Unavailable";
      $("air-quality-label").textContent = "Could not load US AQI";
    });
  try {
    const data = await getJSON(`https://api.open-meteo.com/v1/forecast?${params}`, controller.signal);
    if (controller.signal.aborted) return;
    renderForecast(data, location);
    $("weather-status").textContent = "";
  } catch (error) {
    if (error.name === "AbortError" || controller.signal.aborted) return;
    $("weather-status").textContent = "Could not load weather. Please check your connection and try searching again.";
  }
  await airPromise;
}

function cancelSearch() {
  clearTimeout(searchTimer);
  if (searchController) searchController.abort();
}

function selectLocation(location) {
  cancelSearch();
  selectedLocation = location;
  searchInput.value = locationName(location);
  searchResults.hidden = true;
  searchResults.replaceChildren();
  $("search-status").textContent = "";
  loadWeather(location);
}

async function searchCities(query, selectFirst = false) {
  cancelSearch();
  if (query.length < 2) {
    searchResults.hidden = true;
    $("search-status").textContent = query ? "Enter at least 2 characters." : "";
    return;
  }
  const controller = new AbortController();
  searchController = controller;
  $("search-status").textContent = "Searching...";
  try {
    const params = new URLSearchParams({ name: query, count: "10", language: "en", format: "json" });
    const data = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?${params}`, controller.signal);
    if (controller.signal.aborted) return;
    const results = Array.isArray(data.results) ? data.results : [];
    searchResults.replaceChildren();
    if (!results.length) {
      searchResults.hidden = true;
      $("search-status").textContent = "No cities found.";
      return;
    }
    if (selectFirst) {
      selectLocation(results[0]);
      return;
    }
    results.forEach((location) => {
      const button = element("button", "block w-full px-4 py-3 text-sm text-left hover:bg-surface-container-highest focus:bg-surface-container-highest", locationName(location));
      button.type = "button";
      button.addEventListener("click", () => selectLocation(location));
      searchResults.append(button);
    });
    searchResults.hidden = false;
    $("search-status").textContent = "Choose a location or press Search for the first result.";
  } catch (error) {
    if (error.name === "AbortError" || controller.signal.aborted) return;
    searchResults.hidden = true;
    $("search-status").textContent = "Could not search for cities. Please try again.";
  }
}

searchInput.addEventListener("input", () => {
  cancelSearch();
  searchResults.hidden = true;
  const query = searchInput.value.trim();
  if (query.length < 2) {
    $("search-status").textContent = query ? "Enter at least 2 characters." : "";
    return;
  }
  $("search-status").textContent = "Searching...";
  searchTimer = setTimeout(() => searchCities(query), 300);
});
$("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  searchCities(searchInput.value.trim(), true);
});
document.addEventListener("click", (event) => {
  if (!$("search-form").contains(event.target)) searchResults.hidden = true;
});

searchInput.value = locationName(selectedLocation);
loadWeather(selectedLocation);
setInterval(() => loadWeather(selectedLocation), 10 * 60 * 1000);
