# Privacy Policy — Froggy Money: Expense Tracker

_Last updated: 2026-05-08_

This is the privacy policy for **Froggy Money: Expense Tracker** (the
"app"), an Android application published by **Melkoh** (`dev.melkoh.froggy`).

The short version: **Froggy stores everything locally on your device.
We don't have servers, we don't have accounts, we don't transmit your
financial data anywhere.** The app is designed to work fully offline.

This policy explains the few cases where the app contacts external
services on your behalf, exactly what is sent, and how to turn each
of them off.

## What we collect

**On our servers: nothing.** We don't operate any backend infrastructure.
The app does not have a sign-up flow, does not require an account, and
does not transmit your transactions, balances, places, contacts, or any
other personal data to us.

**On your device:** the app stores everything you enter — accounts,
transactions, categories, places, settings — in a SQLite database in
your device's private app storage. Backups you create manually or on
the auto-backup schedule are written either to the app's private
storage or to a folder you pick (Storage Access Framework on Android).
Both are local-only by default.

## Permissions, and what each one is used for

| Permission | Why the app asks | Optional? |
|---|---|---|
| **Location** (Fine + Coarse) | To capture GPS coordinates for tagging transactions to places, and to auto-pick the nearest saved place when you create a transaction. | Yes — controlled by the "Location stamps" toggle in Settings. The app never reads your location without an explicit user action. |
| **Contacts** | To suggest contacts when you split a bill. The picker reads your address book on the device; the data never leaves the device. | Yes — only requested when you open the contact picker. The app works without it; you can type contact names manually. |
| **Internet** | (1) to fetch live exchange rates when you have multi-currency accounts, (2) to load map tiles for the place picker and spending heatmap, (3) for reverse-geocoding (turning GPS coordinates into a human-readable address). | (1) and (3) are skippable — the app falls back to "today's rate unknown" / "address unavailable" when offline. (2) is required to render maps; if the app can't reach the tile server, the map shows a blank canvas but the rest of the app keeps working. |
| **Biometric / fingerprint** | If you enable Security → Biometric, the app asks the system to authenticate you before opening the Backups screen or disabling random-numbers privacy mode. The biometric API never returns the actual fingerprint to the app — only a yes/no signal. | Yes — disabled by default. |
| **Foreground service / wake lock** | Used by the daily auto-backup foreground task. No content is uploaded; the task only writes a backup file to the location you've already configured. | The auto-backup feature can be disabled. |

## Third-party services the app contacts

When you use certain features, the app makes network requests to the
following third-party services. None of these requests include your
transactions, balances, place names, or any personal data. We do not
have a business relationship with any of them — they are public
services consumed anonymously.

| Service | When the app contacts it | What is sent |
|---|---|---|
| **OpenFreeMap** (`tiles.openfreemap.org`) | When you view a map (place picker, spending heatmap, place detail). | Standard tile-server requests — `(z, x, y)` coordinates of the map area you're viewing. No identifier, no transaction data. |
| **Exchange Rate API** | When you have multi-currency accounts and the cached rates are older than 24 hours. | A request to fetch current rates. No identifier sent. |
| **Android Geocoder** (system service, typically Google Play Services on stock Android) | When the app reverse-geocodes coordinates into an address — either when capturing GPS for a place, or panning the map in the place form. | The lat/lng coordinates of the pin. Nothing else. On de-Googled Android forks, this returns nothing and the app simply leaves the address blank. |

These third parties may apply their own privacy policies to the
network-level metadata (your IP address, request timing). We have no
visibility into or control over their server-side logging.

## What we do **not** do

- **No analytics** — the app does not contain any analytics SDK, no
  crash reporter, no usage telemetry, no marketing trackers. Zero
  third-party SDKs of that category are linked into the build.
- **No ads.**
- **No accounts** — no sign-up, no login, no email collection.
- **No selling, sharing, or renting** of your data — we don't have it
  to sell.
- **No cloud sync** — backup files stay on your device or on the
  external storage location you choose. If you want to put your backup
  on Drive / iCloud / Dropbox, that's your choice and your accounts.
- **No notifications** triggered by remote data — the app does not
  receive push notifications.

## Children

The app is not directed at children under 13 and does not knowingly
collect any data from children. Because the app does not collect any
data on a server, no parental data-deletion request is necessary —
deleting the app removes everything.

## Your data, your control

Every piece of data the app holds about you is on your device:

- **Export** all your data at any time via Settings → Backup & Export.
  The exported file is a single readable JSON; you own it.
- **Delete** all your data by uninstalling the app. Backups stored
  inside the app's private storage are deleted with it; backups in an
  external folder you picked are not (you remain the owner of them).

## Changes to this policy

If we change this policy we will update the date at the top and, where
the change is material, surface a notice in the app. The complete
history is visible in the project's git repository.

## Contact

For questions about this policy or the app:

- **Email**: `<contact@melkoh.dev>` _(swap to your preferred address before publishing)_
- **GitHub**: <https://github.com/Melkoh02/my-wallet>

---

_This policy is offered in good faith. It is not legal advice. If you
operate Froggy in a regulatory environment with stricter requirements
(GDPR data subject rights, CCPA, etc.), please ensure your specific
deployment complies with those rules — the underlying app's
local-first architecture makes most such compliance trivial, but the
words you use to describe it on a public-facing page are your
responsibility._
