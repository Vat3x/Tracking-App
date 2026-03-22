import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { registerDispatcher, getUserDoc } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import { Loader2 } from "lucide-react";

const FLEET_SIZE_OPTIONS = [
  { value: "", label: "Select fleet size" },
  { value: "1-10", label: "1–10 trucks" },
  { value: "11-30", label: "11–30 trucks" },
  { value: "31-100", label: "31–100 trucks" },
  { value: "100+", label: "100+ trucks" },
];

const REFERRAL_OPTIONS = [
  { value: "", label: "Select an option" },
  { value: "google", label: "Google Search" },
  { value: "social", label: "Social Media" },
  { value: "word-of-mouth", label: "Word of Mouth" },
  { value: "industry-event", label: "Industry Event" },
  { value: "other", label: "Other" },
];

const inputClass =
  "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

const labelClass =
  "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

export default function Register() {
  const navigate = useNavigate();
  const { setFirebaseUser, setUserDoc } = useAuthStore();

  // Required
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [address, setAddress] = useState("");
  const [fleetSize, setFleetSize] = useState("");
  const [referralSource, setReferralSource] = useState("");

  const [mcDotNumber, setMcDotNumber] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      const { user } = await registerDispatcher(
        email,
        password,
        displayName,
        companyName,
        { phone, position, address, fleetSize, referralSource, mcDotNumber }
      );
      const userDoc = await getUserDoc(user.uid);

      setFirebaseUser({ uid: user.uid, email: user.email, emailVerified: false });
      setUserDoc(userDoc);
      navigate("/verify-email");
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        setError("An account with this email already exists.");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Use at least 6 characters.");
      } else {
        setError("Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Create Account
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Register your company and start tracking
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ── Account ───────────────────────────────── */}
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                Account
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="displayName" className={labelClass}>
                    Your Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={inputClass}
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <label htmlFor="email" className={labelClass}>
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="dispatcher@company.com"
                  />
                </div>
                <div>
                  <label htmlFor="password" className={labelClass}>
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                    placeholder="At least 6 characters"
                  />
                </div>
                <div>
                  <label htmlFor="confirmPassword" className={labelClass}>
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                    placeholder="Repeat your password"
                  />
                </div>
              </div>
            </fieldset>

            {/* ── Company ───────────────────────────────── */}
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                Company Information
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="companyName" className={labelClass}>
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="companyName"
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className={inputClass}
                    placeholder="Your Transport Co."
                  />
                </div>
                <div>
                  <label htmlFor="address" className={labelClass}>
                    Company Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="address"
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={inputClass}
                    placeholder="City, State"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className={labelClass}>
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputClass}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label htmlFor="position" className={labelClass}>
                    Your Position <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="position"
                    type="text"
                    required
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className={inputClass}
                    placeholder="Owner, Dispatcher, Manager…"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="mcDotNumber" className={labelClass}>
                    MC# or DOT# <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="mcDotNumber"
                    type="text"
                    required
                    value={mcDotNumber}
                    onChange={(e) => setMcDotNumber(e.target.value)}
                    className={inputClass}
                    placeholder="MC-123456 or DOT-789012"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="fleetSize" className={labelClass}>
                    Fleet Size <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="fleetSize"
                    required
                    value={fleetSize}
                    onChange={(e) => setFleetSize(e.target.value)}
                    className={inputClass}
                  >
                    {FLEET_SIZE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="referralSource" className={labelClass}>
                    How did you hear about us? <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="referralSource"
                    required
                    value={referralSource}
                    onChange={(e) => setReferralSource(e.target.value)}
                    className={inputClass}
                  >
                    {REFERRAL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account...
                </span>
              ) : "Create Account"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Already have an account?{" "}
            <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
