import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Resend } from "resend";
import { defineSecret } from "firebase-functions/params";

if (!admin.apps.length) {
  admin.initializeApp();
}

const resendApiKey = defineSecret("RESEND_API_KEY");
const firestore = admin.firestore();

/** Helper: build the branded verification email HTML */
function buildVerificationHtml(displayName: string, verificationLink: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#1e40af;padding:28px 32px;text-align:center;">
              <img src="https://tracking.loadmind.app/logo.png" alt="LoadMind" width="56" height="56" style="display:block;margin:0 auto 12px;border-radius:12px;" />
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">LoadMind Tracker</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Hi ${displayName},</h2>
              <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
                Please verify your email address to activate your LoadMind Tracker account.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${verificationLink}" style="display:inline-block;padding:12px 32px;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.5;">
                If you didn't create this account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                LoadMind Tracker &mdash; Fleet Tracking Platform
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Helper: send a verification email via Resend */
async function sendVerificationEmail(email: string, displayName: string, apiKey: string): Promise<void> {
  const verificationLink = await admin.auth().generateEmailVerificationLink(email, {
    url: "https://tracking.loadmind.app/auth/action",
  });

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: "LoadMind Tracker <team@loadmind.app>",
    to: email,
    subject: "Verify your LoadMind Tracker account",
    html: buildVerificationHtml(displayName, verificationLink),
  });
}

/**
 * When a new dispatcher user doc is created, send a branded verification email.
 */
export const onDispatcherCreated = onDocumentCreated(
  { document: "users/{userId}", secrets: [resendApiKey] },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    if (data.role !== "dispatcher") return;

    const email = data.email;
    const displayName = data.displayName || "there";
    if (!email) return;

    try {
      await sendVerificationEmail(email, displayName, resendApiKey.value());
      console.log(`onDispatcherCreated: Verification email sent to ${email}`);
    } catch (err) {
      console.error(`onDispatcherCreated: Failed to send verification email to ${email}:`, err);
    }
  }
);

/**
 * Callable function: resend verification email for the authenticated user.
 */
export const resendVerification = onCall(
  { secrets: [resendApiKey], cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in");
    }

    const uid = request.auth.uid;
    const userDoc = await firestore.doc(`users/${uid}`).get();
    const data = userDoc.data();
    if (!data?.email) {
      throw new HttpsError("not-found", "User not found");
    }

    try {
      await sendVerificationEmail(data.email, data.displayName || "there", resendApiKey.value());
      return { success: true };
    } catch (err) {
      console.error(`resendVerification: Failed for ${data.email}:`, err);
      throw new HttpsError("internal", "Failed to send verification email");
    }
  }
);
