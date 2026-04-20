import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const recaptchaSecret = defineSecret("RECAPTCHA_SECRET_KEY");

export const verifyRecaptcha = onCall(
  { secrets: [recaptchaSecret] },
  async (request) => {
    const token = request.data?.token;
    if (!token || typeof token !== "string") {
      throw new HttpsError("invalid-argument", "Missing reCAPTCHA token.");
    }

    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${recaptchaSecret.value()}&response=${token}`,
    });

    const data = await res.json();

    if (!data.success) {
      throw new HttpsError("permission-denied", "reCAPTCHA verification failed.");
    }

    return { success: true };
  }
);
