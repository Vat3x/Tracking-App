import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { OtpClient, OtpChannel, InvalidOtpError, OtpExpiredError, RateLimitError } from "@smart-pay-chain/otp";

if (!admin.apps.length) {
  admin.initializeApp();
}

const twilioAccountSid = defineSecret("TWILIO_ACCOUNT_SID");
const twilioAuthToken = defineSecret("TWILIO_AUTH_TOKEN");
const twilioVerifySid = defineSecret("TWILIO_VERIFY_SERVICE_SID");
const verifyGeApiKey = defineSecret("VERIFY_GE_API_KEY");

function twilioAuth(accountSid: string, authToken: string): string {
  return Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

function isGeorgianNumber(phone: string): boolean {
  return phone.startsWith("+995");
}

/**
 * Check if a phone number is already registered in Firebase Auth.
 * Used by the driver app sign-in flow (no invite) to reject unregistered numbers
 * before sending an OTP — avoids creating orphaned Firebase Auth users.
 */
export const checkPhoneExists = onCall({ cors: true }, async (request) => {
  const { phone } = request.data as { phone: string };
  if (!phone || typeof phone !== "string") {
    throw new HttpsError("invalid-argument", "phone is required");
  }

  try {
    await admin.auth().getUserByPhoneNumber(phone);
    return { exists: true };
  } catch {
    return { exists: false };
  }
});

export const sendOtp = onCall(
  { secrets: [twilioAccountSid, twilioAuthToken, twilioVerifySid, verifyGeApiKey] },
  async (request) => {
    const { phone } = request.data as { phone: string };
    if (!phone || typeof phone !== "string") {
      throw new HttpsError("invalid-argument", "phone is required");
    }

    if (isGeorgianNumber(phone)) {
      // verify.ge for Georgian numbers
      const client = new OtpClient({ apiKey: verifyGeApiKey.value(), autoConfig: true });
      try {
        const result = await client.sendOtp({
          phoneNumber: phone,
          channel: OtpChannel.SMS,
          ttl: 300,
          length: 6,
        });
        return { success: true, requestId: result.requestId };
      } catch (err: any) {
        console.error("verify.ge sendOtp error:", err?.message);
        throw new HttpsError("internal", err?.message || "Failed to send OTP.");
      }
    }

    // Twilio for all other numbers
    const sid = twilioAccountSid.value();
    const token = twilioAuthToken.value();
    const serviceSid = twilioVerifySid.value();

    const res = await fetch(
      `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${twilioAuth(sid, token)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: phone, Channel: "sms" }).toString(),
      }
    );

    if (!res.ok) {
      const data = (await res.json()) as { message?: string; code?: number };
      console.error("Twilio sendOtp error:", JSON.stringify(data));
      if (data.code === 60200 || data.code === 21211) {
        throw new HttpsError("invalid-argument", "Invalid phone number.");
      }
      if (data.code === 60202) {
        throw new HttpsError("resource-exhausted", "Too many attempts. Try again later.");
      }
      throw new HttpsError("internal", data.message || "Failed to send OTP.");
    }

    return { success: true };
  }
);

export const verifyOtp = onCall(
  { secrets: [twilioAccountSid, twilioAuthToken, twilioVerifySid, verifyGeApiKey] },
  async (request) => {
    console.log("verifyOtp: called with data", JSON.stringify(request.data));
    const { phone, code, requestId } = request.data as { phone: string; code: string; requestId?: string };
    if (!phone || !code) {
      console.error("verifyOtp: missing phone or code", { phone: !!phone, code: !!code });
      throw new HttpsError("invalid-argument", "phone and code are required");
    }

    if (isGeorgianNumber(phone)) {
      if (!requestId) {
        console.error("verifyOtp: missing requestId for Georgian number", phone);
        throw new HttpsError("invalid-argument", "requestId is required for Georgian numbers");
      }
      const client = new OtpClient({ apiKey: verifyGeApiKey.value(), autoConfig: true });
      try {
        console.log("verifyOtp: calling verify.ge with requestId", requestId);
        await client.verifyOtp({ requestId, code });
        console.log("verifyOtp: verify.ge success");
      } catch (err: any) {
        console.error("verifyOtp: verify.ge error", err?.constructor?.name, err?.message, JSON.stringify(err));
        if (err instanceof InvalidOtpError) {
          throw new HttpsError("invalid-argument", "Invalid or expired code.");
        }
        if (err instanceof OtpExpiredError) {
          throw new HttpsError("invalid-argument", "Invalid or expired code.");
        }
        if (err instanceof RateLimitError) {
          throw new HttpsError("resource-exhausted", "Max verification attempts reached. Request a new code.");
        }
        if (err instanceof HttpsError) throw err;
        throw new HttpsError("internal", err?.message || "Verification failed.");
      }
    } else {
      // Twilio verify
      const sid = twilioAccountSid.value();
      const token = twilioAuthToken.value();
      const serviceSid = twilioVerifySid.value();

      const res = await fetch(
        `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${twilioAuth(sid, token)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: phone, Code: code }).toString(),
        }
      );

      const data = (await res.json()) as { status?: string; message?: string; code?: number };

      if (!res.ok) {
        if (data.code === 60203) {
          throw new HttpsError("resource-exhausted", "Max verification attempts reached. Request a new code.");
        }
        throw new HttpsError("internal", data.message || "Verification failed.");
      }

      if (data.status !== "approved") {
        throw new HttpsError("invalid-argument", "Invalid or expired code.");
      }
    }

    // Look up or create Firebase Auth user by phone number
    let uid: string;
    try {
      const existing = await admin.auth().getUserByPhoneNumber(phone);
      uid = existing.uid;
      console.log("verifyOtp: found existing user", uid);
    } catch (lookupErr: any) {
      console.log("verifyOtp: user not found, creating. Reason:", lookupErr?.code);
      try {
        const created = await admin.auth().createUser({ phoneNumber: phone });
        uid = created.uid;
        console.log("verifyOtp: created new user", uid);
      } catch (createErr: any) {
        console.error("verifyOtp: failed to create user", createErr?.code, createErr?.message);
        throw new HttpsError("internal", "Failed to create user account.");
      }
    }

    const customToken = await admin.auth().createCustomToken(uid, { phone });
    console.log("verifyOtp: returning customToken for uid", uid);
    return { customToken };
  }
);
