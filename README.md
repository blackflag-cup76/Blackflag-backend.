# Blackflag Tournaments — Backend

A real backend for the "select-game" site: hashed-password auth, server-side
admin login, tournaments, registrations (with payment-proof uploads), and a
leaderboard — all backed by SQLite. This replaces the old client-side
`window.storage` logic, which stored plaintext passwords in shared storage
and had the admin passcode hardcoded in the page source.

## 1. Install

```bash
cd backend
npm install
cp .env.example .env
```

## 2. Configure `.env`

- **JWT_SECRET** — generate one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- **ADMIN_PASSWORD_HASH** — hash your real admin passcode (never store it in plain text):
  ```bash
  node -e "console.log(require('bcryptjs').hashSync('your-real-passcode', 12))"
  ```
  Paste the resulting `$2a$...` string into `.env`.
- **CLIENT_ORIGIN** — the origin your frontend is served from (needed for CORS + cookies).

## 3. Run

```bash
npm run seed   # optional: adds sample tournaments for each game
npm start       # or: npm run dev
```

Server runs on `http://localhost:4000` by default. Health check: `GET /api/health`.

## 4. Point the frontend at it

The frontend must send `credentials: 'include'` on every fetch so the
httpOnly session cookies are sent, e.g.:

```js
fetch('http://localhost:4000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ username, password })
});
```

Say the word and I can wire the existing HTML/JS up to these endpoints directly.

## API reference

All responses are JSON. Session state is kept in httpOnly cookies (`token` for
users, `admin_token` for admins) — there's nothing for frontend JS to read or
store itself.

### Auth
| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/api/auth/signup` | — | `{ username, password }` (password ≥ 8 chars) |
| POST | `/api/auth/login` | — | `{ username, password }` |
| POST | `/api/auth/logout` | — | — |
| GET | `/api/auth/me` | user | — |

### Tournaments
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/tournaments?game=&status=` | — | list, filterable |
| GET | `/api/tournaments/:id` | — | single tournament |
| POST | `/api/tournaments` | admin | create |
| PATCH | `/api/tournaments/:id` | admin | partial update (room ID/pass, status, slots, etc.) |
| DELETE | `/api/tournaments/:id` | admin | delete |

### Registrations
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/registrations` | user | multipart form: `tournament_id, in_game_name, in_game_id, team_members, amount_paid, proof` (image file) |
| GET | `/api/registrations/me` | user | your own registrations |
| GET | `/api/registrations?status=` | admin | all registrations, for reviewing payment proofs |
| PATCH | `/api/registrations/:id/status` | admin | `{ status: "confirmed" \| "rejected" \| "pending" }` |

### Admin
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/admin/login` | — | `{ passcode }`, rate-limited |
| POST | `/api/admin/logout` | — | — |
| GET | `/api/admin/users` | admin | list all signed-up users (no password data ever returned) |

### Leaderboard
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/leaderboard?game=` | — | top 100 by earnings |
| POST | `/api/leaderboard` | admin | add/update an entry |

## Security notes

- Passwords are hashed with bcrypt (cost 12) — never stored or returned in plain text.
- The admin passcode lives only as a bcrypt hash in `.env`, never in code.
- Login endpoints are rate-limited (20/15min for users, 10/15min for admin) against brute force.
- Login timing is constant-time-ish for unknown usernames (a dummy bcrypt compare always runs) to avoid leaking which usernames exist.
- Payment-proof uploads are limited to 5MB, restricted to PNG/JPEG/WEBP, and renamed on disk (no user-controlled filenames).
- For production: put this behind HTTPS (so `secure` cookies work), and consider moving `uploads/` to object storage (S3, R2, etc.) instead of local disk if you deploy on ephemeral hosting.
