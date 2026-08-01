# Radiation Survey Lab v1.0 — Public + Private

This package separates the project into two connected interfaces:

- `index.html` — public results map. It displays only surveys marked `published`.
- `lab.html` — full research planner.
- `admin.html` — authenticated survey upload, review, and publication library.
- `Code.gs` — updated Google Apps Script backend with private actions plus two read-only public actions.

## Install

1. Upload all web files except `Code.gs` to the GitHub Pages repository.
2. In the existing Apps Script project, replace the backend with `Code.gs`.
3. In `setupUsers()`, replace `REPLACE_WITH_YOUR_PRIVATE_CODE` with your current private code. Do not post the code publicly.
4. Run `upgradeSurveySheet()` once. This preserves existing rows and adds the `dataFileId` column.
5. Run `setupUsers()` only if you need to reset the approved account list or access codes.
6. Deploy a new Apps Script web-app version using the same deployment.
7. Confirm the `/exec` URL in `admin.js` and `public.js` matches the deployment.

## Publishing workflow

1. Upload a CSV, GeoJSON, JSON, TXT, or GPX survey through `admin.html`.
2. Review its metadata.
3. Click **Publish**.
4. The survey appears automatically in `index.html` after refresh.

The public endpoint never returns drafts, hidden/rejected records, access codes, uploader emails, private Drive URLs, folder URLs, detector IDs, or supporting-file links.

## Important

Older records uploaded before this version may not have a `dataFileId`. The backend attempts to recover the file ID from the existing Drive URL. New uploads save the file ID directly.
