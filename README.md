# Mod Vote

A small React + Node.js website for voting on next season's Minecraft mods. Discord OAuth identifies the voter, and the server checks their current roles in your Discord guild before allowing access. Admins can manage the list at `/admin`.

## Requirements

- Node.js **22.13+** and npm
- A Discord application (OAuth2 login) and its bot installed in your guild
- A server that can serve the site over HTTPS (recommended for production)

## Setup

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create/select an application. Under **OAuth2**, add the redirect URI `https://your-domain.example/auth/callback` (for local development: `http://localhost:3000/auth/callback`).
2. Under **Bot**, create a bot token, then add the bot to your Discord guild. It needs access to the guild members endpoint; no privileged gateway intents or gateway connection are used.
3. Copy `.env.example` to `.env`. Set:
   - `PUBLIC_URL` to the public site base URL (no trailing slash).
   - `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`.
   - `DISCORD_VOTER_ROLE_IDS` to one or more comma-separated Discord role IDs.
   - `DISCORD_ADMIN_ROLE_IDS` to one or more comma-separated Discord admin role IDs.
4. Run:
   ```sh
   npm install
   npm run build
   npm start
   ```
5. Visit `PUBLIC_URL`. Admins with the configured Discord admin role can use `/admin`.

For development, run `npm run dev` and visit `http://localhost:5173`. Discord OAuth still redirects to `http://localhost:3000/auth/callback`; use port 3000 for full login testing, or set `PUBLIC_URL=http://localhost:5173` and add that callback to Discord while retaining the Vite proxy.

## How voting works

- Every eligible Discord user may give **one vote per mod** and remove that vote while voting is open.
- The backend enforces vote uniqueness using `(mod_id, user_id)` as the SQLite primary key.
- Votes are stored persistently in `data/votes.sqlite` by default. Back up this file (and its WAL files while live) or use SQLite's backup facility.
- The administrator can add/edit/delete mods, view aggregate results, and open/close voting. Deleting a mod deletes its votes.
- Admin roles automatically grant player access.
- Discord roles are rechecked server-side at least every 60 seconds on activity; users removed from the guild or role lose access after the cache expires. If Discord fails, authorization fails closed.
- User sessions expire in seven days and can be ended with Log out.

## Reverse proxy (nginx)

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Set `TRUST_PROXY=1` only when requests reach Node through a trusted proxy. Keep the Node port private. Use HTTPS and the corresponding HTTPS `PUBLIC_URL` in production.

## Security notes

- Discord bot token and OAuth secret are **server-side only**; never prefix these with `VITE_` or commit `.env`.
- OAuth callback checks a short-lived state cookie. Session cookies are HTTP-only, SameSite=Lax, and Secure on HTTPS.
- Mutation endpoints reject requests with a mismatched Origin, and all admin checks are server-side.
- Discord user IDs, session hashes, and votes are stored locally. Explain this to your players if required by your community privacy policy.
- The site uses fonts from Google Fonts; remove the CSS import for fully offline hosting.

## Testing

```sh
npm test
npm run build
```

The initial tests cover permission matching, token hashing, and input validation.
