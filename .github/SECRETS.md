# Required GitHub Actions secrets

These are read by `.github/workflows/ios-build.yml` and the Fastlane lane it
calls. All required values are currently configured — this file is the
inventory for future audits / onboarding new contributors.

## App Store Connect API auth

| Secret | Used for | Notes |
|---|---|---|
| `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect auth | 10-character Key ID from the API key download page. |
| `APP_STORE_CONNECT_API_ISSUER_ID` | App Store Connect auth | Issuer ID UUID from the same page. |
| `APP_STORE_CONNECT_API_KEY_CONTENT` | App Store Connect auth | Raw contents of the `AuthKey_XXXXXXXXXX.p8` file. Paste the full PEM block including the `-----BEGIN PRIVATE KEY-----` header. **Not** base64-encoded — `Fastfile` sets `is_key_content_base64: false`. |

## Vite build-time

Baked into the iOS bundle so the wrapped app talks to the right Supabase
project. Both values are also exposed at runtime in the bundled JS (anon
key is public by design; URL is just an endpoint), so no special handling
beyond "keep them out of git" is required.

| Secret | Used for | Where to find it |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase client URL | Supabase Dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase client anon key | Supabase Dashboard → Project Settings → API → Project API keys → `anon` (`public`) |

The third env var the build step sets — `VITE_API_BASE_URL: https://cygne.skin` —
is a literal in the workflow file, not a secret, since `cygne.skin` is a
public production domain.

## Match — code signing

`fastlane match` keeps the distribution cert + provisioning profile in an
encrypted private git repo so every CI run can pull them. First-run setup
was: create the private repo, set the two secrets below, run the workflow
once with `readonly: false` (current state) so Match populates the repo.

| Secret | Used for | Notes |
|---|---|---|
| `MATCH_GIT_URL` | Match's source of truth for certs | `https://github.com/lianakala101-beep/cygne-certificates.git` (private). |
| `MATCH_PASSWORD` | Match encryption passphrase | Encrypts the cert + profile in the repo above. **If lost**, the cert in the repo is permanently unreadable — recovery means nuking the repo and re-creating from scratch. Stash a copy in 1Password. |

**TODO after first successful run:** flip `readonly: false` → `readonly: true`
in `fastlane/Fastfile`. With `readonly: true`, a stray workflow change
can't accidentally regenerate the cert and revoke the existing one — Match
will fail loudly instead.

## Verifying

```
gh secret list
```

Should show all seven secret names. Values aren't readable after they're
set — re-set the secret to update.
