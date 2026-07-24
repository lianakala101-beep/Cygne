// Deep-link modal wrapper around RampCheckinCard.
//
// Rendered from App.jsx when a push notification tap fires the
// pushNotificationActionPerformed listener with
//   notification.data = { type: "ramp_checkin", product_id, week_number }
// The listener sets state pointing at a specific (product, week);
// this component looks the product up and presents the check-in in a
// bottom-sheet overlay so the user can respond without switching to
// the Progress tab first.
//
// Design mirrors AskCygneModal / ScanModal: fixed inset, ivory-inky
// backdrop with blur, bottom-anchored card. The card is reused
// verbatim so the visual language matches the inline nudge on the
// Progress tab.

import { useEffect } from "react";
import { RampCheckinCard } from "./RampCheckinCard.jsx";

export function RampCheckinModal({ products, deepLink, onSubmit, onClose }) {
  const product = deepLink ? products?.find((p) => p.id === deepLink.productId) : null;

  // Close silently if the tap referenced a product that's since been
  // removed from the shelf. Deferred to an effect so we're not calling
  // setState during render.
  useEffect(() => {
    if (deepLink && products && !product) {
      onClose?.();
    }
  }, [deepLink, products, product, onClose]);

  if (!deepLink || !product) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8,10,9,0.88)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        zIndex: 200,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 600,
          padding: "20px 18px 32px",
          background: "var(--color-ivory-shadow, #1c1c1a)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        }}
      >
        <RampCheckinCard
          productName={product.name}
          weekNumber={deepLink.weekNumber}
          onSubmit={async (state, note) => {
            await onSubmit(product.id, deepLink.weekNumber, state, note);
            onClose?.();
          }}
          onDismiss={onClose}
        />
      </div>
    </div>
  );
}
