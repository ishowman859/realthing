# Verity

Verity is a monorepo for media provenance and integrity verification.

It includes:

- an Android app for capture, normalization, hashing, registration, and verification
- an Express + PostgreSQL backend for asset storage, verification APIs, batch sealing, and Merkle proof generation
- a public web verification page for hash lookup and client-side Merkle path verification

The project is designed around a simple idea:

1. capture or select media
2. normalize it into a stable verification format
3. compute `SHA-256` and `pHash`
4. register those values on the backend
5. seal grouped records into Merkle roots
6. let users verify records later from the app or the web

## What This Repository Contains

| Path | Purpose |
| --- | --- |
| `app/` | Expo / React Native mobile app |
| `server/` | Express API, PostgreSQL integration, verification logic, Merkle batching |
| `index.html`, `script.js`, `style.css` | Public verification web UI |
| `admin.*` | Admin UI for backend configuration and inspection |
| `programs/` | Optional Solana / Anchor program code |
| `chain/` | Optional local chain and infra scripts |
| `tests/` | Chain / hash-related test assets |

## Core Product Flow

### Registration

The mobile app captures a photo or video, applies the project’s normalization rules, computes hashes, and sends a registration request to the backend.

For photos, the current app flow standardizes the capture into a bounded JPEG before hashing. The app also stores registration metadata such as capture time, GPS when available, first-stage filter output, and normalization metadata.

### Verification

Verification works from both the mobile app and the public web page.

- hash-based verification: compute local hashes and search for a matching record
- Merkle verification: reconstruct the root from the server-provided proof path in the client

### Batch Sealing

The backend groups records into batches, computes Merkle trees, stores the proof path for each asset, and can optionally anchor the batch root on Solana.

## Main Features

- standardized photo hashing pipeline for app and web
- `SHA-256` exact-match verification
- `pHash` similarity search
- Merkle proof generation and verification
- optional Solana memo anchoring
- admin UI for runtime configuration

## Repository Structure

```text
realthing/
├── .github/workflows/          # CI / Pages deployment
├── app/                        # Expo mobile app
├── chain/                      # Optional local chain / infra scripts
├── programs/                   # Optional Anchor programs
├── server/                     # Express backend
├── tests/                      # Tests and fixtures
├── admin.css
├── admin.html
├── admin.js
├── index.html
├── script.js
├── style.css
├── WEB.md
└── README.md
```

## Quick Start

### 1. Start the API server

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

Important environment variables include:

- `DATABASE_URL`
- `VERIFY_BASE_URL`
- `CORS_ORIGIN`
- optional Solana settings
- optional S3 / AI settings

More backend details are in [`server/README.md`](server/README.md).

### 2. Start the Android app

```bash
cd app
npm install
npx expo start
```

### 3. Run the public verification page locally

From the repository root:

```bash
npx serve .
```

Then open the static page with an API override, for example:

```text
http://localhost:3000/?api=http://localhost:4000
```

## Web Verification Model

The web UI is a static client. It does not know the API host unless one is provided.

It resolves the API base in this order:

1. `window.__VERITY_API_BASE__`
2. `?api=https://your-api-host`
3. `<meta name="verity-default-api" ...>`
4. local fallback for `localhost`
5. same-origin proxy setups such as `/api`

The most important web verification endpoints are:

- `POST /v1/verify/search-hashes`

See [`WEB.md`](WEB.md) for static hosting, Pages, and domain setup.

## Android App Notes

The Android app currently includes:

- camera capture
- automatic photo registration after capture
- photo normalization before hashing
- `SHA-256` and `pHash` registration
- verification lookup from selected media
- local pending-anchor tracking
- local notification when anchoring completes while the app is still able to poll

Android release APKs are built locally in `app/android/` and versioned incrementally during development.

## Merkle Verification

Verity does not require clients to download a full Merkle tree.

Instead, the server returns:

- the leaf hash
- the sibling path
- the stored root

The app and web client can then recompute the path and confirm whether the published root matches the returned record.

This keeps verification lightweight while still making the batch seal inspectable.

## Solana Anchoring

Solana anchoring is optional.

When enabled, the backend can publish a memo payload containing the Verity batch root. The backend supports both enabled and disabled anchor modes, and can run against `devnet` or `mainnet-beta` depending on environment configuration.

Relevant backend docs:

- [`server/README.md`](server/README.md)

## Deployment

Typical deployment split:

- web UI on GitHub Pages or another static host
- API on EC2, ECS, Railway, Fly.io, or another backend host
- PostgreSQL on a managed database or self-hosted instance
- optional ALB / reverse proxy for HTTPS API access

For production, make sure these are aligned:

- frontend domain
- API domain
- `VERIFY_BASE_URL`
- `CORS_ORIGIN`
- any GitHub Pages API injection variables

## Documentation

- [`WEB.md`](WEB.md): static web hosting, Pages, `?api=`, admin UI notes
- [`server/README.md`](server/README.md): backend endpoints, environment variables, Merkle batching, Solana anchoring

## License

MIT
