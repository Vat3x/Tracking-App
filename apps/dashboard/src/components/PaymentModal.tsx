import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface PaymentModalProps {
  checkoutUrl: string;
  onClose: () => void;
  onComplete: () => void;
}

export default function PaymentModal({ checkoutUrl, onClose, onComplete }: PaymentModalProps) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "flitt-payment-complete") {
        onComplete();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="relative flex flex-col w-full max-w-lg rounded-2xl bg-white shadow-2xl dark:bg-gray-900 overflow-hidden"
        style={{ height: "640px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <span className="font-semibold text-gray-900 dark:text-white">Complete Payment</span>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Loading spinner */}
        {!loaded && (
          <div className="absolute inset-0 top-[57px] flex items-center justify-center bg-white dark:bg-gray-900">
            <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin" />
          </div>
        )}

        {/* Flitt iframe */}
        <iframe
          src={checkoutUrl}
          title="Payment"
          className="flex-1 w-full border-0"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}
