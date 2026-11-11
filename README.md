# Weather

Open `index.html` in a browser or serve this directory with `python3 -m http.server`.
Search for a city and choose a result to see its current weather, hourly and
seven-day forecasts. The default location is Cupertino, California. Temperatures
are shown in Fahrenheit and wind speeds in mph.

Weather and city search are provided by [Open-Meteo](https://open-meteo.com/);
air quality uses its separate US AQI endpoint. Weather refreshes every ten
minutes. An internet connection is required, and air quality may be unavailable
even when the forecast is available.

Run the dependency-free tests with `node --test weather.test.js`.
