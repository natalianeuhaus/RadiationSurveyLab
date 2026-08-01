# Radiation Survey Lab v0.7

A separate research tool derived from the visual and mapping foundation of *Greetings from Niagara*. The original Niagara website was not modified.

## Included

- Deep dark-red interface  
- Address search 
- Latitude/longitude search
- Draw a survey polygon
- Generate a lawnmower flight path
- Altitude, speed, spacing, and route-angle controls 
- Distance, time, pass, and waypoint estimates
- GeoJSON, KML, CSV, and experimental DJI KMZ export
- Import and label multiple walking, vehicle, drone, stationary, or community Radiacode surveys
- Separate trusted-uploader admin page
- One owner account plus two approved uploader accounts
- Google Apps Script + Drive + Sheets backend template
- Owner-controlled workflow: Draft / Published / Hidden / Rejected

## Open locally

Open `index.html` in a browser. `admin.html` runs in local preview mode until the Apps Script endpoint is configured.

## Configure the online admin

Read `apps-script/README-SETUP.txt`.

## Important

- The planned route is not the actual flight log.
- Use the actual DJI flight log when assigning GPS coordinates to radiation measurements.
- DJI KMZ export remains experimental and must be tested in an empty controlled area.
- Community and drone datasets remain separate because detector model, height, speed, and collection method affect readings.


## v0.8 separated trusted accounts

- One owner account and two approved uploader accounts.
- Each uploader receives only their own survey records from the server.
- Each uploader can edit only their own unpublished metadata.
- Uploaders cannot alter the owner's data or another uploader's data.
- Only the owner can publish, hide, reject, restore, or manage every survey.
- Address/coordinate search, dark-red styling, flight planning, and community survey import remain unchanged.
