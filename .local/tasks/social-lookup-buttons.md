# Social Lookup Buttons for Results

## What & Why
When the tool finds a name on a website, add quick-access buttons next to it so the user can instantly verify the person and find their email via social/search — without manually copying and pasting anything.

## Done looks like
- Each result row and result card shows two icon buttons next to the extracted name:
  - **LinkedIn** — opens a LinkedIn people search for the name + domain in a new tab
  - **Google** — opens a Google search for `"@domain.com" CEO` (or the detected role if available) in a new tab to surface indexed email addresses
- If the crawler found a Facebook page URL for the site (already in socialLinks), a third **FB Page** button appears that opens that specific Facebook page in a new tab (not a people search — the actual page)
- Buttons appear in both the Results table and the result detail cards
- Buttons are small, icon-style, and don't break the existing layout
- All links open in a new tab

## Out of scope
- Automatically scraping LinkedIn or Facebook (no login, no API)
- Auto-confirming or importing data from social results
- Searching Facebook for people (only the site's own FB page, if found)

## Tasks
1. **Search URL builder** — For each result, generate the LinkedIn people search URL (name + domain as keywords) and the Google search URL using the format `"@domain.com" role`, falling back to CEO if no role is detected.

2. **Facebook page button logic** — Check the existing `socialLinks` array returned by the crawler for a facebook.com URL. If found, use it as the FB Page button target. If not found, hide the button entirely.

3. **Add buttons to Results table** — In the Results tab table, add a small button group in the Name column (or a dedicated Actions column) with the LinkedIn, Google, and conditional FB Page icons, each opening their URL in a new tab.

4. **Add buttons to result cards** — Mirror the same button group in the individual result detail cards/modal view.

## Relevant files
- `public/js/app.js`
- `public/css/styles.css`
- `server/routes/scan.js:30-43`
