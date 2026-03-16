import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { resendVerificationEmail, logout, auth } from "@/services/auth";
import { Loader2, Mail, RefreshCw } from "lucide-react";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const { firebaseUser, setFirebaseUser } = useAuthStore();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState("");

  // Poll every 5s to check if user verified their email
  useEffect(() => {
    const interval = setInterval(async () => {
      const user = auth.currentUser;
      if (!user) return;
      await user.reload();
      if (user.emailVerified) {
        setFirebaseUser({ uid: user.uid, email: user.email, emailVerified: true });
        navigate("/", { replace: true });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [navigate, setFirebaseUser]);

  async function handleResend() {
    setResending(true);
    setError("");
    try {
      await resendVerificationEmail();
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch (err: any) {
      setError(err?.message || "Failed to send email");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="mx-auto w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
            <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>

          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Verify your email
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            We sent a verification link to
          </p>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-6">
            {firebaseUser?.email}
          </p>

          <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
            Click the link in the email to verify your account. This page will update automatically.
          </p>

          {error && (
            <p className="text-xs text-red-500 mb-4">{error}</p>
          )}

          <div className="space-y-3">
            <button
              onClick={handleResend}
              disabled={resending || resent}
              className="w-full h-10 flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {resending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : resent ? (
                "Email sent!"
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Resend verification email
                </>
              )}
            </button>

            <button
              onClick={logout}
              className="w-full h-10 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
