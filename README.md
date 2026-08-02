# Radiation Survey Lab v2

Radiation Survey Lab v2 is now one public research interface plus one private review page. 

## Public interface

`index.html` includes:

- published, approved radiation survey projects;
- address and coordinate search;
- survey-area drawing;
- lawnmower-route generation;
- GeoJSON, KML, CSV, and experimental DJI KMZ mission export;
- local preview of CSV, TXT, GeoJSON, JSON, and GPX radiation data;
- public project submission for Radiacode and other Geiger counters, scintillation detectors, spectrometers, custom loggers, walking surveys, vehicle surveys, stationary readings, and drone surveys.

Uploaders provide a project name, collection method, contact email, instrument, location, methodology, data file, and optional supporting file. Contact information remains private.

## Private interface

`admin.html` is owner-only. It does not contain a survey upload form. It is used only to:

- review submitted projects and private contact information;
- open the private Drive files;
- approve and publish a project;
- keep a project hidden;
- reject a project.

Nothing appears on the public map until it is approved and published.

## Install or upgrade

1. Upload the web files to the GitHub Pages repository.
2. Replace the Apps Script backend with `Code.gs`.
3. In `setupUsers()`, replace `REPLACE_WITH_YOUR_PRIVATE_CODE` with the owner access code. Never place the real code in the public GitHub repository.
4. Run `upgradeSurveySheet()` once. Existing survey rows are preserved and missing v2 columns are added.
5. Run `setupUsers()` if the owner account or access code needs to be created or reset.
6. Deploy a new version of the Apps Script web app using the same deployment.
7. Confirm the `/exec` URL in both `public.js` and `admin.js` matches the deployed web app.

## Accepted public data files

The public preview and published map support:

- CSV or TXT with latitude and longitude columns;
- comma-, semicolon-, or tab-delimited text;
- GeoJSON or JSON containing points, tracks, or latitude/longitude objects;
- GPX tracks, routes, or waypoints.

Recognized measurement fields include CPM, CPS, dose rate, µSv/h, and timestamps. Supporting files may also include KML, KMZ, PDF, JPG, JPEG, or PNG.

## Privacy

The public endpoints do not return contact email, phone, private Drive links, folder links, file IDs, reviewer information, or unpublished submissions.
