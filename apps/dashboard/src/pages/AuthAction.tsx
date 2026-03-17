import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { applyActionCode } from "firebase/auth";
import { auth } from "@/services/auth";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function AuthAction() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode");
  const oobCode = searchParams.get("oobCode");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (mode === "verifyEmail" && oobCode) {
      applyActionCode(auth, oobCode)
        .then(() => setStatus("success"))
        .catch(() => setStatus("error"));
    } else {
      setStatus("error");
    }
  }, [mode, oobCode]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
          {status === "loading" && (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Verifying your email...
              </h1>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Email verified!
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Your account is now active. You can close this tab — the original page will redirect automatically.
              </p>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Verification failed
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                This link may have expired or already been used.
              </p>
              <Link
                to="/login"
                className="inline-block px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                Back to Login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
