# Changelog

## [Unreleased] — US phone auth back to Twilio Verify (2026-05-20)

User upgraded their Twilio account, so US `+1` numbers now go through Twilio Verify again (was using native Firebase Phone Auth as a cost-saving fallback).

**What changed**
- `apps/driver/src/services/phoneAuth.ts`: removed the `isUsNumber` branch. `sendVerificationCode` and `verifyOtpAndSignIn` now call `sendOtp` / `verifyOtp` Cloud Functions for all non-Georgian numbers. Dropped the `pendingUsConfirmation` state and the `mintJsToken` client call.

**What did not change**
- Backend `functions/src/phone.ts` already routes `+1` through Twilio Verify (the Twilio path was always there) — no Cloud Function redeploy needed.
- Georgian `+995` numbers continue through verify.ge.
- `mintJsToken` Cloud Function left deployed (now unused by client; harmless).
- Twilio secrets confirmed set: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`.

**How shipped**
- OTA published to production for both iOS + Android (runtime `1.0.9`).
- Update group: `c04a13f7-7b72-469c-bc55-ae597c025c58`.
- Pure JS change — no native rebuild required.

## [Unreleased] — Driver app auth UX cleanup (2026-05-20)

Shipped via OTA (runtime `1.0.9`, both platforms) in this session:

- **US native phone-auth path wired up** — `apps/driver/src/services/phoneAuth.ts` now routes `+1` numbers through `nativeAuth().signInWithPhoneNumber` and finishes the JS-SDK side via the new `mintJsToken` Cloud Function. Non-`+1` numbers continue via Twilio `sendOtp` / `verifyOtp`. Exported `mintJsToken` from `functions/src/index.ts`.
- **Stale pending-invite banner fixed** — added `apps/driver/src/services/pendingInvite.ts` (10-min TTL helper around `@pending_invite_id` + new `@pending_invite_ts`). Wired into `invite/[id].tsx`, `app/_layout.tsx`, `(auth)/onboarding.tsx`, `(auth)/login.tsx`. Old entries (no timestamp) are treated as expired and auto-cleared on next open, so "Invited by …" no longer shows on cold starts without a fresh deep link.
- **Removed outdated invite-required guidance** — dropped the yellow "Don't have an account? Open the invite link…" card and the phone-OTP "No Account Found" alert. Phone signup now proceeds to the name step when no Firestore user doc exists, matching the open-registration backend.
- **Back link on login screen** — when navigated from Welcome, a text link "Already have an account? Sign in" appears below the **Send Code** CTA (styled like the email tab's switch link). Hidden when there's no screen to return to or while in OTP entry.

## [Unreleased] — Email-only driver registration

Removed phone-OTP path from the driver login screen — email/password is now the sole registration & sign-in method.

- `apps/driver/app/(auth)/login.tsx`: stripped phone/email tab bar, country picker, OTP step, name-collection step, and all related state/handlers.
- Removed imports of `phoneAuth` service, `COUNTRY_CODES`, `isValidPhoneDigits`, `buildFullNumber`, `sanitizeOtp`, `nativeAuth`, `Keyboard`.
- Welcome screen unchanged; its buttons now land directly on the email form.
- `apps/driver/src/services/phoneAuth.ts` left in place (now unreferenced); backend `sendOtp` / `verifyOtp` Cloud Functions untouched.
- Registration now requires confirming the password and enforces an 8-character minimum (was 6).

## [Unreleased] — Hybrid phone-OTP router

Planned: route phone-OTP by country prefix in the driver app to stop spending Twilio trial credit on US drivers.

- `+1` (US) → Firebase Phone Auth client SDK (free up to 10k/mo)
- `+995` (Georgia) → verify.ge (unchanged)
- All others → Twilio Verify (unchanged)

### Backend (done, not yet deployed)
- Added `mintJsToken` onCall in `functions/src/phone.ts` — auth-required, returns a custom token for `request.auth.uid` so the JS SDK can join the session after native-SDK phone sign-in.
- Re-exported `mintJsToken` from `functions/src/index.ts`.
- `sendOtp` / `verifyOtp` / `checkPhoneExists` untouched.

### Driver app (pending)
- Add country-prefix router in `apps/driver/src/services/phoneAuth.ts`.
- For `+1`: `nativeAuth().signInWithPhoneNumber(phone)`, hold `confirmation` module-level, then after `confirmation.confirm(code)` call `mintJsToken` and `jsSignInWithCustomToken` to keep dual-SDK pattern intact.
- Keep public signatures (`sendVerificationCode`, `verifyOtpAndSignIn`) stable so OTP screens don't change.

### Done when
- New `+1` registration creates a Firebase Auth user with `providerId: "phone"` and produces no Twilio Verify log entry.
- Davit (`+19294071064`, uid `bmfvwVNxShe2tiEWlQ2rniJYtfU2`) and other existing `+1` users still sign in.
- `+995` continues via verify.ge.
- Other country codes still route through Twilio.
- Firestore reads succeed immediately after sign-in.
