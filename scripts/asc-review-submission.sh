#!/usr/bin/env bash
# One-shot App Store Connect API driver for the reviewSubmissions flow.
#
# Workaround for the ASC web UI bug where the "In-App Purchases and
# Subscriptions" section fails to render on the version edit page,
# blocking us from attaching Cygne Premium's monthly/annual subscriptions
# to v1.0.3's review submission.
#
# Two modes (set via $MODE):
#   dry-run  – creates a reviewSubmission container, attaches the app
#              version + every READY_TO_SUBMIT subscription found, then
#              prints the resulting state. Nothing is submitted; the
#              container just sits in ASC waiting.
#   submit   – takes $SUBMISSION_ID_INPUT (from a prior dry-run) and
#              PATCHes it with { submitted: true }. This is the
#              irreversible step.
#
# Required env (workflow injects from GH secrets):
#   ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_CONTENT (.p8 file contents)
#   MODE, VERSION_STRING, SUBMISSION_ID_INPUT (submit mode only)

set -euo pipefail

: "${ASC_KEY_ID:?ASC_KEY_ID required}"
: "${ASC_ISSUER_ID:?ASC_ISSUER_ID required}"
: "${ASC_KEY_CONTENT:?ASC_KEY_CONTENT required}"
: "${MODE:?MODE required (dry-run or submit)}"
: "${VERSION_STRING:?VERSION_STRING required}"

API="https://api.appstoreconnect.apple.com"

# --- JWT ---------------------------------------------------------------
# ES256, exp≤20min, aud=appstoreconnect-v1. Ruby's `jwt` gem does the
# ES256 signature cleanly; OpenSSL CLI can't produce the JWS-formatted
# raw-r||s signature without extra plumbing.
JWT=$(ruby -rjwt -e '
  key = OpenSSL::PKey.read(ENV["ASC_KEY_CONTENT"])
  payload = {
    iss: ENV["ASC_ISSUER_ID"],
    iat: Time.now.to_i,
    exp: Time.now.to_i + 20*60,
    aud: "appstoreconnect-v1"
  }
  header = { kid: ENV["ASC_KEY_ID"], typ: "JWT" }
  puts JWT.encode(payload, key, "ES256", header)
')
echo "[jwt] generated (20 min ttl)"

AUTH_HDR="Authorization: Bearer $JWT"
CT_HDR="Content-Type: application/json"

# Small helper that curls, prints the response, and asserts HTTP 2xx.
# Prints a header line so the workflow log is scannable.
api() {
  local label="$1"; shift
  local method="$1"; shift
  local url="$1"; shift
  local body="${1:-}"
  echo ""
  echo "----- $label -----"
  echo "$method $url"
  if [[ -n "$body" ]]; then
    echo "body: $body"
  fi
  local tmp; tmp=$(mktemp)
  local code
  if [[ -n "$body" ]]; then
    code=$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" \
      -H "$AUTH_HDR" -H "$CT_HDR" -d "$body" "$url")
  else
    code=$(curl -sS -o "$tmp" -w "%{http_code}" -X "$method" \
      -H "$AUTH_HDR" "$url")
  fi
  echo "HTTP $code"
  cat "$tmp" | jq . 2>/dev/null || cat "$tmp"
  if [[ "$code" -lt 200 || "$code" -ge 300 ]]; then
    echo "!!! $label failed with HTTP $code"
    rm -f "$tmp"
    exit 1
  fi
  RESP_BODY=$(cat "$tmp")
  rm -f "$tmp"
}

# ---------------------------------------------------------------------
# submit mode: no lookups needed, just PATCH the passed-in submission ID.
if [[ "$MODE" == "submit" ]]; then
  : "${SUBMISSION_ID_INPUT:?SUBMISSION_ID_INPUT required for submit mode}"
  echo "[submit] PATCHing reviewSubmission $SUBMISSION_ID_INPUT with submitted=true"
  api "PATCH reviewSubmissions/$SUBMISSION_ID_INPUT (submit)" \
    PATCH "$API/v1/reviewSubmissions/$SUBMISSION_ID_INPUT" \
    "{\"data\":{\"type\":\"reviewSubmissions\",\"id\":\"$SUBMISSION_ID_INPUT\",\"attributes\":{\"submitted\":true}}}"
  echo ""
  echo "=========================================="
  echo "SUBMITTED. Review is now with Apple."
  echo "=========================================="
  exit 0
fi

if [[ "$MODE" != "dry-run" ]]; then
  echo "MODE must be 'dry-run' or 'submit' (got: $MODE)"
  exit 1
fi

# ---------------------------------------------------------------------
# dry-run mode: full lookup + create + attach chain, no submit.

BUNDLE_ID="com.cygne.app"
echo "[bundle] $BUNDLE_ID"

# Step 2: find APP_ID
api "GET apps?filter[bundleId]=$BUNDLE_ID" \
  GET "$API/v1/apps?filter%5BbundleId%5D=$BUNDLE_ID"
APP_ID=$(echo "$RESP_BODY" | jq -r '.data[0].id // empty')
if [[ -z "$APP_ID" ]]; then
  echo "!!! No app found for bundleId $BUNDLE_ID"
  exit 1
fi
echo "[app] APP_ID=$APP_ID"

# Step 3: find VERSION_ID for VERSION_STRING
api "GET apps/$APP_ID/appStoreVersions?filter[versionString]=$VERSION_STRING" \
  GET "$API/v1/apps/$APP_ID/appStoreVersions?filter%5BversionString%5D=$VERSION_STRING&limit=20"
# Prefer a version in a submittable-editable state; fall back to first
# hit and let ASC reject at the attach step if it's not editable.
VERSION_ID=$(echo "$RESP_BODY" | jq -r '
  (.data
    | map(select(.attributes.appStoreState=="PREPARE_FOR_SUBMISSION"
              or .attributes.appStoreState=="DEVELOPER_REJECTED"
              or .attributes.appStoreState=="METADATA_REJECTED"
              or .attributes.appStoreState=="REJECTED"
              or .attributes.appStoreState=="INVALID_BINARY"
              or .attributes.appStoreState=="WAITING_FOR_REVIEW"
              or .attributes.appStoreState=="READY_FOR_REVIEW"))
   | .[0].id) // (.data[0].id // empty)')
if [[ -z "$VERSION_ID" ]]; then
  echo "!!! No appStoreVersion found for $VERSION_STRING"
  exit 1
fi
echo "[version] VERSION_ID=$VERSION_ID (versionString=$VERSION_STRING)"

# Step 4: enumerate subscription groups + subscriptions
api "GET apps/$APP_ID/subscriptionGroups" \
  GET "$API/v1/apps/$APP_ID/subscriptionGroups?limit=50"
GROUP_IDS=$(echo "$RESP_BODY" | jq -r '.data[].id')

ALL_SUB_JSON="[]"
for GID in $GROUP_IDS; do
  api "GET subscriptionGroups/$GID/subscriptions" \
    GET "$API/v1/subscriptionGroups/$GID/subscriptions?limit=50"
  ALL_SUB_JSON=$(jq -c --argjson prev "$ALL_SUB_JSON" '$prev + .data' <<<"$RESP_BODY")
done

echo ""
echo "----- All subscriptions found -----"
echo "$ALL_SUB_JSON" | jq '.[] | {id, productId: .attributes.productId, name: .attributes.name, state: .attributes.state}'

# Collect READY_TO_SUBMIT ids
READY_IDS=$(echo "$ALL_SUB_JSON" | jq -r '.[] | select(.attributes.state=="READY_TO_SUBMIT") | .id')
if [[ -z "$READY_IDS" ]]; then
  echo "!!! No subscriptions in READY_TO_SUBMIT state. Aborting before creating an empty submission."
  echo "    Fix each subscription's blockers (pricing, localization, review screenshot) then re-run."
  exit 1
fi
echo "[subs] READY_TO_SUBMIT ids:"
echo "$READY_IDS" | sed 's/^/  - /'

# Step 5: create reviewSubmission container
api "POST reviewSubmissions" \
  POST "$API/v1/reviewSubmissions" \
  "{\"data\":{\"type\":\"reviewSubmissions\",\"attributes\":{\"platform\":\"IOS\"},\"relationships\":{\"app\":{\"data\":{\"type\":\"apps\",\"id\":\"$APP_ID\"}}}}}"
SUBMISSION_ID=$(echo "$RESP_BODY" | jq -r '.data.id')
if [[ -z "$SUBMISSION_ID" || "$SUBMISSION_ID" == "null" ]]; then
  echo "!!! Failed to create reviewSubmission"
  exit 1
fi
echo "[submission] SUBMISSION_ID=$SUBMISSION_ID"

# Step 6: attach appStoreVersion
api "POST reviewSubmissionItems (appStoreVersion=$VERSION_ID)" \
  POST "$API/v1/reviewSubmissionItems" \
  "{\"data\":{\"type\":\"reviewSubmissionItems\",\"relationships\":{\"reviewSubmission\":{\"data\":{\"type\":\"reviewSubmissions\",\"id\":\"$SUBMISSION_ID\"}},\"appStoreVersion\":{\"data\":{\"type\":\"appStoreVersions\",\"id\":\"$VERSION_ID\"}}}}}"

# Step 7: attach each subscription
for SID in $READY_IDS; do
  api "POST reviewSubmissionItems (subscription=$SID)" \
    POST "$API/v1/reviewSubmissionItems" \
    "{\"data\":{\"type\":\"reviewSubmissionItems\",\"relationships\":{\"reviewSubmission\":{\"data\":{\"type\":\"reviewSubmissions\",\"id\":\"$SUBMISSION_ID\"}},\"subscription\":{\"data\":{\"type\":\"subscriptions\",\"id\":\"$SID\"}}}}}"
done

# Final state readback so the workflow log shows what's staged.
api "GET reviewSubmissions/$SUBMISSION_ID?include=items" \
  GET "$API/v1/reviewSubmissions/$SUBMISSION_ID?include=items"

echo ""
echo "=========================================="
echo "DRY-RUN COMPLETE — nothing submitted yet."
echo ""
echo "SUBMISSION_ID: $SUBMISSION_ID"
echo "APP_ID:        $APP_ID"
echo "VERSION_ID:    $VERSION_ID"
echo "SUBS ATTACHED:"
echo "$READY_IDS" | sed 's/^/  - /'
echo ""
echo "To finalize (irreversible), re-run this workflow with:"
echo "  mode          = submit"
echo "  submission_id = $SUBMISSION_ID"
echo "=========================================="
