// Whether the post-onboarding "how does your skin feel" prompt
// (FirstCheckInPrompt) should be offered right now.
//
// Two invariants:
//   - never offered to a user who already has a journal entry (of any
//     date) — they've already given us this data, asking again is noise.
//   - offered at most once per account — callers persist `offered` the
//     moment this returns true, before the user has even interacted with
//     the prompt, so a reload between the offer and the tap can't cause
//     a second offer.
export function shouldOfferFirstCheckIn({ journals = [], offered = false } = {}) {
  if (offered) return false;
  return (Array.isArray(journals) ? journals : []).length === 0;
}
