# IPO Application Status Checker

A React + Vite + Tailwind app that checks IPO allotment status for a PAN using the
KFin Technologies (KFintech) IPO status API, the same API used by
<https://ipostatus.kfintech.com/>.

> **Verification status:** the request/response contract below was read from the
> public JavaScript bundle of the official KFintech site on 2026-10-27. It has **not
> yet been confirmed with a live request from this app.** See
> [Verifying the integration](#verifying-the-integration).

## Quick start

Requires Node.js 20 or newer.

To use **MUFG Intime**, also run `npm run server` in a second terminal (see
[Registrars](#registrars)).

```bash
npm install
cp .env.example .env      # optional; defaults work without it
npm run dev               # http://localhost:5173
npm test                  # unit tests (PAN validation, response parsing, formatting)
npm run build             # production build in dist/
```

## Registrars

Pick the registrar in the form (the starting choice comes from `VITE_REGISTRAR`).
The PAN input, bulk checking, results table and CSV are the same for every
registrar. Each registrar's contract lives in one adapter under
[src/registrars/](src/registrars/), which converts its response to the app's
record fields:

| Registrar | Adapter | Browser direct? | IPO list |
|---|---|---|---|
| KFin Technologies | [kfintech.js](src/registrars/kfintech.js) | Yes (if CORS allows) | Loaded live through the proxy from the official site's bundle; built-in fallback |
| MUFG Intime (Link Intime) | [mufg.js](src/registrars/mufg.js) | **No: always through the proxy** | Loaded live from the registrar; built-in fallback |

**Adding a registrar:** write `src/registrars/<id>.js` exporting an object with
`id`, `name`, `defaultUrl`, `browserDirect`, `ipos`, `query()` and optionally
`listIpos()` (the interface is documented in
[src/registrars/index.js](src/registrars/index.js)). Then add it to `REGISTRARS`
and add its URL env var to `UPSTREAM_URLS` in [server/index.js](server/index.js).

### MUFG Intime contract

Read from the inline script of
<https://in.mpms.mufg.com/Initial_Offer/public-issues.html> on 2026-10-27. All
calls are ASP.NET page methods (`POST` JSON, response `{ "d": "<string>" }`):

1. `IPO.aspx/generateToken` returns a token tied to the `ASP.NET_SessionId` cookie.
2. `IPO.aspx/SearchOnPan` with `{ clientid, PAN, IFSC: "", CHKVAL: "1", token }`, where
   `token` is AES-128-CBC encrypted with the fixed key/IV in the page. The response is DataSet
   XML with one `<Table>` per application, `<Table1><Msg>` for a registrar message, and an
   empty `<NewDataSet />` for no record.
3. `IPO.aspx/GetDetails` returns the IPO list (`company_id`, `companyname`).

Field mapping: `NAME1` → applicant name, `SHARES` → shares applied, `ALLOT` →
shares allotted, `PEMNDG` → application no. The last mapping is **unverified**:
`PEMNDG` is the value the official page shows in the "Application Details – …"
heading. Other fields (such as `offer_price` and `AMTADJ`) are kept. The registrar's
CORS header is malformed, so browsers can't call it and requests go through the
proxy. The IPO list and token flow have been checked against the live service; a
search returning real application records has not.

## KFintech API contract

Derived from `ipostatus.kfintech.com/static/js/main.bd1f330c.js`:

| Item | Value |
|---|---|
| Method | `GET` |
| URL | `https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=pan` |
| Header `reqparam` | The PAN, uppercase (e.g. `ABCDE1234F`) |
| Header `client_id` | Numeric identifier of the IPO being queried (from the site's IPO dropdown) |
| Auth / CAPTCHA / session | None used by the official site |

Other `type` values the official site uses (not implemented here): `appno`
(`reqparam` = `<application no>|<PAN>`) and `dpclid` (`reqparam` = DP ID + Client ID).

**Responses**

| Status | Meaning (as handled by the official site) | This app |
|---|---|---|
| 200 | `{ "data": [ { ...record }, ... ] }` | Shows every record |
| 404 | Allotment status not found | "No application records found for the supplied PAN." |
| 429 | Too many requests | Error + Retry |
| 500/502/504 | Temporary failure | Error + Retry |

Record fields the official site displays: `Appln_No`, `Name` (applicant),
`DP_CLID`, `Pan_No`, `App_Shares`, `All_Shares`, `category`. This app shows those
fields with friendly labels, plus **any other non-empty fields** the API returns.
Missing fields are omitted, never filled in.

### Important: one IPO per request

The API answers **per IPO**: every request carries a `client_id` naming one IPO.
There is no documented call that returns every IPO for a PAN, so the user picks an
IPO from a dropdown and the app shows **all** application records for that PAN in
that IPO. The app does not send one request per IPO in the background, which would
multiply load on the registrar.

### Checking many PANs

Paste up to 50 PANs (one per line, or separated by commas or spaces). Duplicates
are ignored and invalid entries must be fixed before the check starts. PANs are
checked **one at a time** with a pause between requests (`VITE_BULK_DELAY_MS`,
default 1500 ms, so 40 PANs take about a minute). Failed requests are retried
automatically: twice, after 15 s on a 429 and after 3 s on timeouts and 5xx
errors. If 3 PANs fail in a row, the batch stops, because the service is probably
down or blocking requests. **Stop** pauses a batch, and **Retry unfinished**
resumes it. The results table has one row per application (a PAN with no record
gets one "No record" row), and **Export CSV** saves the whole batch.

### Keeping the IPO dropdown current

Registrars add IPOs without notice, so the dropdown is loaded live from
`GET /api/ipos?registrar=<id>` (the Azure Functions API in production, or
`npm run server` locally):

- **KFintech** has no list endpoint. Its site embeds the list in its JS bundle
  (`main.<hash>.js`) and publishes a new bundle when an IPO is added. The proxy
  reads `https://ipostatus.kfintech.com/`, follows the current bundle, and
  extracts the `{ clientId, name }` entries.
- **MUFG Intime** uses `IPO.aspx/GetDetails`.

The proxy caches each list for 5 minutes (`IPO_LIST_CACHE_MS`) and serves the last
good copy if the registrar is unreachable. The page re-checks every 10 minutes
while it's open, and again when the tab comes back into view. **Refresh list**
checks right away, and newly added IPOs are announced above the form. If the live
list can't load, the page falls back to the built-in list in the adapter (KFintech:
as of 2026-10-31) or a `VITE_IPO_LIST_<ID>` override, and labels it "saved list".

## Configuration

All variables are optional. **Anything prefixed `VITE_` is bundled into the
browser build and is public.** The API needs no secret, and none should ever be
put in a `VITE_` variable.

| Variable | Default | Purpose |
|---|---|---|
| `VITE_REGISTRAR` | `kfintech` | Registrar selected on load: `kfintech` or `mufg` |
| `VITE_IPO_API_MODE` | `direct` | `direct`: the browser calls registrars that allow it (KFintech). `proxy`: everything goes through the Express proxy. MUFG Intime always uses the proxy. |
| `VITE_IPO_API_URL` | KFintech URL above | KFintech direct-mode endpoint (must be `https://`) |
| `VITE_IPO_PROXY_URL` | `/api/ipo-status` | Proxy status endpoint |
| `VITE_IPO_LIST_URL` | `/api/ipos` | Proxy IPO-list endpoint |
| `VITE_IPO_API_TIMEOUT_MS` | `20000` | Client request timeout |
| `VITE_IPO_LIST_<ID>` | adapter's list | JSON array of `{ "clientId", "name" }` per registrar (`VITE_IPO_LIST` = KFintech) |
| `VITE_BULK_DELAY_MS` | `1500` | Pause between requests when checking several PANs |
| `PORT` | `8787` | Proxy port |
| `KFIN_API_URL` | KFintech URL above | Proxy upstream for KFintech |
| `MUFG_API_URL` | `https://in.mpms.mufg.com/Initial_Offer/IPO.aspx` | Proxy upstream for MUFG Intime (a method URL like `…/SearchOnPan` also works) |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated origin allowlist for the proxy |
| `IPO_LIST_CACHE_MS` | `300000` | How long the proxy reuses a registrar's IPO list (`0` = always refetch) |
| `RATE_LIMIT_PER_MINUTE` | `60` | Proxy requests per IP per minute |
| `UPSTREAM_TIMEOUT_MS` | `15000` | Proxy upstream timeout |

## CORS

The official site calls the API straight from the browser, so direct mode is the
default. Whether the API allows *other* origins (such as `localhost:5173` or your
domain) has not been verified. If it doesn't, the browser blocks the request, and
the app shows a "Network error" mentioning CORS.

Do not work around this from the frontend. If KFintech permits server-side access
for your use case, run the optional proxy:

```bash
npm run server                          # starts server/index.js on :8787
# in .env: VITE_IPO_API_MODE=proxy
npm run dev                             # Vite forwards /api to :8787
```

The proxy validates PAN and IPO id formats, enforces an origin allowlist and a
per-IP rate limit, sets `Cache-Control: no-store`, and never logs request contents.

## Deploying to Azure Static Web Apps

The site is the Vite build (`dist/`), and the proxy runs as the built-in Azure
Functions API in [api/](api/), serving the same `/api/ipo-status` and `/api/ipos`
routes as `server/index.js`. Both hosts use the logic in
[src/registrars/proxyCore.js](src/registrars/proxyCore.js).

- **App location** `/`, **API location** `api`, **Output location** `dist`.
- [.env.production](.env.production) sets `VITE_IPO_API_MODE=proxy`, so every
  registrar is called through the same-origin API (no CORS needed).
- [staticwebapp.config.json](staticwebapp.config.json) sets the API runtime (Node 20).
- Optional app settings (Azure portal → Environment variables): `KFIN_API_URL`,
  `MUFG_API_URL`, `UPSTREAM_TIMEOUT_MS`.
- Azure builds `api/` on its own, so it holds a copy of `src/registrars/`. After
  changing anything there, run `npm run sync:api` and commit the result; a test
  fails if the copy is stale.
- Unlike `server/index.js`, the Functions API has no per-IP rate limit.

## Which files to deploy to Azure Static Web Apps

**Azure CLI deploy.** Upload two folders; there is nothing to pick by hand:

| Folder | Contents | Notes |
|---|---|---|
| `dist/` | The built site: `index.html`, `assets/*.js`, `assets/*.css` | Created by `npm run build`. Don't edit it. |
| `api/` | `host.json`, `package.json`, `src/functions/*.js`, `src/shared/registrars/*.js` | Azure installs the dependencies. Don't upload `api/node_modules`. |

`staticwebapp.config.json` is read from the project root.

```bash
npm run build
# Deployment token: az staticwebapp secrets list -n <app> -g <resource group> --query properties.apiKey -o tsv
# Put it in the SWA_CLI_DEPLOYMENT_TOKEN environment variable, then:
npx @azure/static-web-apps-cli deploy ./dist --api-location ./api --api-language node --api-version 20 --env production
```

**GitHub or VS Code extension deploy.** Azure builds from the repo (app location
`/`, API location `api`, output location `dist`), so the repo must contain:

- `src/`, `index.html`, `package.json`, `package-lock.json`
- `vite.config.js`, `tailwind.config.js`, `postcss.config.js`
- `.env.production`, `staticwebapp.config.json`
- the whole `api/` folder, including `api/src/shared/registrars/` (generated by `npm run sync:api`)

**Never upload or commit:** `node_modules/` (root or `api/`), `.env`, any file with
real PANs (such as `pan.txt`; `*.txt` is git-ignored). `server/` is only for
running the proxy on your own machine and isn't used on Azure.

Uploading files by hand in the Azure portal is not supported for Static Web Apps.

## Verifying the integration

1. `npm run dev` and open the browser's DevTools → Network tab.
2. Pick an IPO, enter **your own** PAN and click **Check IPO Status**.
3. Check the `OPTIONS` preflight and the `GET`:
   - A CORS error means direct mode is blocked; see [CORS](#cors).
   - A 200 with `{ "data": [...] }` confirms the contract.
   - A 404 means no record for that PAN in that IPO.
4. If the response shape differs, update `extractRecords` in
   [src/services/ipoApi.js](src/services/ipoApi.js) and its tests.

## Security and privacy

- PAN and DP/Client IDs are masked in the UI and the CSV export (last 4 characters visible).
- The PAN is never written to localStorage, sessionStorage, cookies, analytics or logs, and there is no search history. It is held in memory only so Retry can repeat the search.
- Requests use `cache: no-store`, `credentials: omit` and `referrerPolicy: no-referrer`. Direct mode refuses non-HTTPS URLs.
- PAN validation is a format check (`^[A-Z]{5}[0-9]{4}[A-Z]$`) only. A match does not mean the PAN was validly issued.
- Allotment status ("Allotted" / "Not allotted") is shown only when the API returns a numeric `All_Shares` value, the same rule the official site uses.
- CSV export contains masked values. Check KFintech's terms before redistributing data.

## Project structure

```
server/index.js              Express proxy (any registrar; required for MUFG Intime)
src/
  App.jsx                    Registrar/IPO selection, batch state, stop/resume
  registrars/index.js        Registrar registry and adapter interface
  registrars/kfintech.js     KFintech contract and IPO list
  registrars/mufg.js         MUFG Intime contract (token, XML parsing) and IPO list
  registrars/errors.js       Shared error types
  config/ipos.js             IPO list overrides, starting registrar
  services/ipoApi.js         Direct vs proxy routing, timeouts, error mapping
  services/bulkCheck.js      Sequential multi-PAN checking with pacing and retries
  utils/panValidation.js     PAN normalisation and format validation
  utils/formatters.js        Field labels, masking, allotment status, CSV
  components/                Header, PanSearchForm, BulkResults, ResultsSection, ResultsTable,
                             ResultCard, StatusBadge, LoadingState, ErrorMessage
```
