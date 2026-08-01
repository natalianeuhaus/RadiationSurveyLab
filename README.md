# Radiation Survey Lab — v0.1

A separate browser-based flight-path planner derived from the visual and mapping approach of *Greetings from Niagara*. The original Niagara website is not modified.

## Run

Open `index.html` in a browser while connected to the internet (Leaflet, map tiles, Leaflet Draw, and JSZip are loaded from CDNs). For the most reliable local use on macOS, run a tiny local server from Terminal:

```bash
cd /path/to/RadiationSurveyLab
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Current features

- Draw one survey polygon
- Generate a clipped lawnmower route
- Adjustable altitude, speed, spacing, and route angle
- Distance, time, pass, and waypoint estimates
- Export GeoJSON, KML, and CSV
- Experimental DJI WPML/KMZ export

## Important distinction

The exported path is the **planned mission**. After the drone flies, use the **actual DJI flight log** to geolocate Radiacode readings, because wind and flight corrections can make the actual route differ from the planned route.

## DJI warning

The KMZ output is experimental. DJI Fly on the RC 2 does not expose a standard third-party mission import button. Validate the file with a compatible installer/viewer, and test only over an empty controlled area at a conservative altitude before any low-level survey.

## Next version

- DJI flight-log import
- Radiacode data import
- Timestamp offset and interpolation
- Radiation-colored route and GeoJSON export
- Optional Niagara historical reference overlays

Address lookup uses OpenStreetMap Nominatim and requires an internet connection. Coordinate search works without address lookup.
