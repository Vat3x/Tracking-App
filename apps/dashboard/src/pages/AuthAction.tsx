import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "@/services/auth";
import { Loader2, CheckCircle2, XCircle, Lock } from "lucide-react";

const LOGIN_URL = "https://tracking.load-mind.com";

export default function AuthAction() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode");
  const oobCode = searchParams.get("oobCode");

  const [status, setStatus] = useState<"loading" | "success" | "error" | "resetForm">("loading");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!oobCode) {
      setStatus("error");
      return;
    }

    if (mode === "verifyEmail") {
      applyActionCode(auth, oobCode)
        .then(() => setStatus("success"))
        .catch(() => setStatus("error"));
    } else if (mode === "resetPassword") {
      verifyPasswordResetCode(auth, oobCode)
        .then((email) => {
          setResetEmail(email);
          setStatus("resetForm");
        })
        .catch((err) => {
          console.error("verifyPasswordResetCode failed:", err);
          setStatus("error");
        });
    } else {
      setStatus("error");
    }
  }, [mode, oobCode]);

  const handleResetPassword = async () => {
    setResetError("");
    if (password.length < 6) {
      setResetError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPw) {
      setResetError("Passwords do not match");
      return;
    }
    setResetting(true);
    try {
      await confirmPasswordReset(auth, oobCode!, password);
      setStatus("success");
    } catch {
      setResetError("Failed to reset password. The link may have expired.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
          {status === "loading" && (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {mode === "resetPassword" ? "Verifying reset link..." : "Verifying your email..."}
              </h1>
            </>
          )}

          {status === "resetForm" && (
            <>
              <Lock className="w-12 h-12 text-blue-500 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Set your password
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {resetEmail}
              </p>
              <div className="space-y-3 text-left">
                <input
                  type="password"
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {resetError && (
                  <p className="text-sm text-red-500">{resetError}</p>
                )}
                <button
                  onClick={handleResetPassword}
                  disabled={resetting}
                  className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {resetting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Set Password
                </button>
              </div>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {mode === "resetPassword" ? "Password updated!" : "Email verified!"}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {mode === "resetPassword"
                  ? "Your password has been updated. Open the LoadMind Tracker app and log in with your new password."
                  : "Your account is now active. You can close this tab — the original page will redirect automatically."}
              </p>
              {mode === "resetPassword" ? (
                <a
                  href="nexustracking://"
                  className="inline-block px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                >
                  Open App
                </a>
              ) : (
                <a
                  href={LOGIN_URL}
                  className="inline-block px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                >
                  Go to Login
                </a>
              )}
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {mode === "resetPassword" ? "Reset link invalid" : "Verification failed"}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                This link may have expired or already been used.
              </p>
              <a
                href={LOGIN_URL}
                className="inline-block px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                Back to Login
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
