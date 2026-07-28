import type { SupportivePlusOfferDecision } from '../paywall';

interface SupportivePlusOfferProps {
  decision: SupportivePlusOfferDecision;
  onDismiss: () => void;
}

/** There is intentionally no purchase action until a provider is approved and connected. */
export function SupportivePlusOffer({ decision, onDismiss }: SupportivePlusOfferProps) {
  if (!decision.shouldDisplay) return null;

  return (
    <aside className="supportive-plus-offer" aria-label="معرفی LearnBox Plus">
      <p>{decision.supportiveCopy}</p>
      <button className="text-button" type="button" onClick={onDismiss}>
        فعلاً نه، ادامهٔ یادگیری
      </button>
    </aside>
  );
}
