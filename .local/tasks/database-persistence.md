# Database Persistence for Lead Results

## What & Why
Currently all scanned lead data is stored in browser localStorage, which means it disappears when you clear the browser, switch devices, or open incognito. Replace this with server-side PostgreSQL persistence using the user's Neon database, so all leads are saved permanently on the server and loaded from there on every page open.

## Done looks like
- On page load, the app fetches all previously saved leads from the database and populates the Dashboard and Results tab
- Every completed scan (single, bulk, and Excel import) automatically saves to the database
- Dashboard stats (total, verified, safe, risky) are computed from the database
- A "Delete" button on each row in both the Dashboard and Results tables removes that single lead from the database
- Data survives page reloads, browser clears, different devices, and server restarts
- localStorage is removed as the primary storage mechanism

## Out of scope
- User authentication / multi-user separation (all leads share one table)
- Pagination for very large datasets (load all leads, capped at 1000)
- Editing existing lead records

## Tasks
1. **Store secret & install driver** — Store the Neon connection string as `NEON_DATABASE_URL` secret. Install the `pg` npm package.

2. **Database module** — Create `server/lib/db.js` that connects to the Neon database using `NEON_DATABASE_URL` and exports a `query()` helper. On startup, auto-create the `leads` table if it does not exist (columns: id, domain, name, email, contact_email, verification_score, verification_status, mx_records, social_links, people, personal_emails, company_emails, verifications_json, scanned_at).

3. **Leads API routes** — Add new Express routes:
   - `GET /api/leads` — return all saved leads (newest first, max 1000)
   - `POST /api/leads` — save a new lead (called after each scan)
   - `DELETE /api/leads/:id` — delete a single lead by id

4. **Plug saving into scan pipeline** — After each successful scan result in `server/routes/scan.js` (both single and bulk), call the save endpoint logic to insert the lead into the database.

5. **Plug saving into Excel pipeline** — After each processed row in `server/routes/excel.js`, save the lead to the database.

6. **Frontend: load from server on startup** — Replace the `loadSavedResults()` localStorage call with a `GET /api/leads` fetch on page load. Populate Dashboard and Results table from the server response.

7. **Frontend: save via API** — Replace `saveResults()` localStorage call in `addResult()` with a `POST /api/leads` fetch.

8. **Frontend: delete button** — Add a small delete button (trash icon) to each row in the Dashboard and Results tables. On click, call `DELETE /api/leads/:id` and remove the row from the UI.

9. **Remove localStorage** — Strip out the `STORAGE_KEY` constant, `loadSavedResults()`, and `saveResults()` functions from `public/js/app.js`.

## Relevant files
- `server/index.js`
- `server/routes/scan.js`
- `server/routes/excel.js`
- `public/js/app.js`
- `package.json`
