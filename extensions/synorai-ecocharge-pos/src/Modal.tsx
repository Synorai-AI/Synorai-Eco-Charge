import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';

// The app backend computes the fee plan from the canonical schedule so the
// extension never carries fee amounts or category logic of its own.
const APP_URL = 'https://eco-fee-automator.onrender.com';

type PlanAddLine = { variantId: number; quantity: number; title: string };
type PlanUpdateLine = PlanAddLine & { uuid: string };
type PlanRemoveLine = { uuid: string; title: string };

type FeePlan = {
  ok: boolean;
  error?: string;
  province?: string;
  toAdd?: PlanAddLine[];
  toUpdate?: PlanUpdateLine[];
  toRemove?: PlanRemoveLine[];
};

type ModalStatus = 'loading' | 'ready' | 'applying' | 'done' | 'error';

export default async () => {
  render(<EcoFeeModal />, document.body);
};

function EcoFeeModal() {
  const [status, setStatus] = useState<ModalStatus>('loading');
  const [plan, setPlan] = useState<FeePlan | null>(null);
  const [message, setMessage] = useState<string>('');

  const loadPlan = useCallback(async () => {
    setStatus('loading');
    setMessage('');

    try {
      const lineItems = shopify.cart.current.value?.lineItems ?? [];

      if (lineItems.length === 0) {
        setPlan(null);
        setStatus('ready');
        setMessage('The cart is empty. Add products first.');
        return;
      }

      const token = await shopify.session.getSessionToken();
      if (!token) {
        throw new Error('Could not get a session token from POS.');
      }

      const response = await fetch(`${APP_URL}/api/pos/fee-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lines: lineItems.map((item) => ({
            uuid: item.uuid,
            productId: item.productId ?? null,
            variantId: item.variantId ?? null,
            quantity: item.quantity,
          })),
        }),
      });

      const result: FeePlan = await response.json();

      if (!result.ok) {
        setPlan(null);
        setStatus('error');
        setMessage(result.error || 'The fee service returned an error.');
        return;
      }

      setPlan(result);
      setStatus('ready');

      const changes =
        (result.toAdd?.length ?? 0) +
        (result.toUpdate?.length ?? 0) +
        (result.toRemove?.length ?? 0);

      if (changes === 0) {
        setMessage('Eco fees are already correct for this cart.');
      }
    } catch (error) {
      setPlan(null);
      setStatus('error');
      setMessage(
        error instanceof Error ? error.message : 'Could not load the fee plan.',
      );
    }
  }, []);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const applyPlan = useCallback(async () => {
    if (!plan) return;
    setStatus('applying');

    try {
      for (const line of plan.toRemove ?? []) {
        await shopify.cart.removeLineItem(line.uuid);
      }

      // Updates are applied as remove + re-add, matching the previous
      // behaviour of this extension.
      for (const line of plan.toUpdate ?? []) {
        await shopify.cart.removeLineItem(line.uuid);
        await shopify.cart.addLineItem(line.variantId, line.quantity);
      }

      for (const line of plan.toAdd ?? []) {
        await shopify.cart.addLineItem(line.variantId, line.quantity);
      }

      setStatus('done');
      setMessage('Eco fees applied.');
      shopify.toast.show('Eco fees applied');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Applying fees failed.');
    }
  }, [plan]);

  const pendingChanges =
    (plan?.toAdd?.length ?? 0) +
    (plan?.toUpdate?.length ?? 0) +
    (plan?.toRemove?.length ?? 0);

  return (
    <s-page heading="Eco fees">
      <s-scroll-box>
        {status === 'loading' && <s-text>Checking the cart…</s-text>}

        {message ? <s-text>{message}</s-text> : null}

        {plan && pendingChanges > 0 && status !== 'done' && (
          <s-section heading={`Planned changes (${plan.province})`}>
            {(plan.toAdd ?? []).map((line) => (
              <s-text key={`add-${line.variantId}`}>
                {`Add ${line.quantity} × ${line.title}`}
              </s-text>
            ))}
            {(plan.toUpdate ?? []).map((line) => (
              <s-text key={`upd-${line.uuid}`}>
                {`Set ${line.title} to ${line.quantity}`}
              </s-text>
            ))}
            {(plan.toRemove ?? []).map((line) => (
              <s-text key={`rem-${line.uuid}`}>{`Remove ${line.title}`}</s-text>
            ))}

            <s-button
              variant="primary"
              loading={status === 'applying'}
              disabled={status === 'applying'}
              onClick={applyPlan}
            >
              Apply eco fees
            </s-button>
          </s-section>
        )}

        {status !== 'loading' && status !== 'applying' && (
          <s-button onClick={loadPlan}>Re-check cart</s-button>
        )}
      </s-scroll-box>
    </s-page>
  );
}
