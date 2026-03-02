import { useState } from "react";
import { createInvite, generateInviteLink } from "@/services/invites";
import { useAuthStore } from "@/stores/auth";
import { toast } from "sonner";

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  companyName: string;
}

export default function InviteModal({ open, onClose, companyName }: InviteModalProps) {
  const { userDoc } = useAuthStore();
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function handleGenerate() {
    if (!userDoc?.companyId) return;
    setLoading(true);
    try {
      const invite = await createInvite(
        userDoc.companyId,
        companyName,
        userDoc.id
      );
      setLink(generateInviteLink(invite.id));
      toast.success("Invite link generated");
    } catch {
      toast.error("Failed to generate invite link");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setLink(null);
    setCopied(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Invite Driver
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Generate a tracking request link. Share it with a driver via
          WhatsApp, email, or any messenger. The link expires in 72 hours.
        </p>

        {!link ? (
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full h-10 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Generating..." : "Generate Link"}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <input
                readOnly
                value={link}
                className="flex-1 bg-transparent text-sm text-gray-700 outline-none truncate"
              />
              <button
                onClick={handleCopy}
                className="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full h-10 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Generate New Link
            </button>
          </div>
        )}

        <button
          onClick={handleClose}
          className="w-full mt-3 h-10 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
