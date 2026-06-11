# Required GitHub Actions secrets

These are read by `.github/workflows/ios-build.yml` (and the Fastlane lane it
calls). Add each one in **Settings → Secrets and variables → Actions →
Repository secrets**. Names are case-sensitive.

## Already configured

| Secret | Used for | Notes |
|---|---|---|
| `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect auth | The 10-character Key ID from the API key download page. |
| `APP_STORE_CONNECT_API_ISSUER_ID` | App Store Connect auth | The Issuer ID UUID from the same page. |
| `APP_STORE_CONNECT_API_KEY_CONTENT` | App Store Connect auth | Raw contents of the `AuthKey_XXXXXXXXXX.p8` file. Paste the full PEM block, including the `-----BEGIN PRIVATE KEY-----` header. Do **not** base64-encode — `Fastfile` sets `is_key_content_base64: false`. |

## Need to add for the iOS build

| Secret | Used for | Where to find the value |
|---|---|---|
| `VITE_SUPABASE_URL` | Baked into the Vite bundle so the wrapped iOS app talks to the right Supabase project | Supabase Dashboard → Project Settings → API → Project URL (e.g. `https://mxcefgbaaylddnyxrnao.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Baked into the Vite bundle for client-side auth | Supabase Dashboard → Project Settings → API → Project API keys → `anon` (`public`) |

Both values are also exposed at runtime in the bundled JS (anon key is
public by design; URL is just an endpoint), so no special handling beyond
"keep them out of git" is required.

## Need to add for Match-based code signing

The `Fastfile` calls `sync_code_signing(type: "appstore")`, which is Match.
Match keeps the distribution cert + provisioning profile in an encrypted
git repo so every CI machine can pull them. First-run setup:

1. Create a private git repo (e.g. `lianakala101-beep/cygne-match`).
2. Run `fastlane match init` locally once (on a Mac) to bootstrap it, OR
   let the first CI run create it (set `readonly: false` in the lane —
   already configured).
3. Add these two secrets:

| Secret | Used for | Notes |
|---|---|---|
| `MATCH_GIT_URL` | Tells Match which repo to read certs from | The HTTPS clone URL of the private repo above. |
| `MATCH_PASSWORD` | Encrypts/decrypts the certs in the Match repo | Any strong passphrase — generate one and stash it in 1Password. Lose it and you have to nuke the Match repo and re-create from scratch. |

Then update `Fastfile`'s `sync_code_signing` call with `git_url: ENV["MATCH_GIT_URL"]` (or set it in a `fastlane/Matchfile`). I left it off the initial commit so the first CI failure points at this README rather than at a Match error message that says "no git_url".

After the first successful run, flip `readonly: true` in the `Fastfile` so a future workflow change can't accidentally regenerate the cert and revoke the existing one.

## Verifying

```
gh secret list
```

Should show all 5 secret names (or 7 with the optional Match ones). Values aren't readable after they're set — re-set the secret if you need to update it.
