import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  Navigator,
  Screen,
  ScrollView,
  Section,
  Text,
  reactExtension,
  useApi,
} from "@shopify/ui-extensions-react/point-of-sale";

// The app backend computes the fee plan from the canonical schedule so the
// extension never carries fee amounts or category logic of its own.
const APP_URL = "https://eco-fee-automator.onrender.com";

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

type ModalStatus = "loading" | "ready" | "applying" | "done" | "error";

const EcoFeeModal = () => {
  const api = useApi<"pos.home.modal.render">();
  const [status, setStatus] = useState<ModalStatus>("loading");
  const [plan, setPlan] = useState<FeePlan | null>(null);
  const [message, setMessage] = useState<string>("");

  const loadPlan = useCallback(async () => {
    setStatus("loading");
    setMessage("");

    try {
      const cart = api.cart.subscribable.initial;
      const lineItems = Array.isArray(cart?.lineItems) ? cart.lineItems : [];

      if (lineItems.length === 0) {
        setPlan(null);
        setStatus("ready");
        setMessage("The cart is empty. Add products first.");
        return;
      }

      const token = await api.session.getSessionToken();
      if (!token) {
        throw new Error("Could not get a session token from POS.");
      }

      const response = await fetch(`${APP_URL}/api/pos/fee-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lines: lineItems.map((item: any) => ({
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
        setStatus("error");
        setMessage(result.error || "The fee service returned an error.");
        return;
      }

      setPlan(result);
      setStatus("ready");

      const changes =
        (result.toAdd?.length ?? 0) +
        (result.toUpdate?.length ?? 0) +
        (result.toRemove?.length ?? 0);

      if (changes === 0) {
        setMessage("Eco fees are already correct for this cart.");
      }
    } catch (error) {
      setPlan(null);
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not load the fee plan.",
      );
    }
  }, [api]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const applyPlan = useCallback(async () => {
    if (!plan) return;
    setStatus("applying");

    try {
      for (const line of plan.toRemove ?? []) {
        await api.cart.removeLineItem(line.uuid);
      }

      // POS Cart API has no quantity-update call, so updates are re-adds.
      for (const line of plan.toUpdate ?? []) {
        await api.cart.removeLineItem(line.uuid);
        await api.cart.addLineItem(line.variantId, line.quantity);
      }

      for (const line of plan.toAdd ?? []) {
        await api.cart.addLineItem(line.variantId, line.quantity);
      }

      setStatus("done");
      setMessage("Eco fees applied.");
      api.toast.show("Eco fees applied");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Applying fees failed.",
      );
    }
  }, [api, plan]);

  const pendingChanges =
    (plan?.toAdd?.length ?? 0) +
    (plan?.toUpdate?.length ?? 0) +
    (plan?.toRemove?.length ?? 0);

  return (
    <Navigator>
      <Screen name="eco-fees" title="Eco fees">
        <ScrollView>
          {status === "loading" && <Text>Checking the cart…</Text>}

          {message ? <Text>{message}</Text> : null}

          {plan && pendingChanges > 0 && status !== "done" && (
            <>
              <Section title={`Planned changes (${plan.province})`}>
                {(plan.toAdd ?? []).map((line) => (
                  <Text key={`add-${line.variantId}`}>
                    {`Add ${line.quantity} × ${line.title}`}
                  </Text>
                ))}
                {(plan.toUpdate ?? []).map((line) => (
                  <Text key={`upd-${line.uuid}`}>
                    {`Set ${line.title} to ${line.quantity}`}
                  </Text>
                ))}
                {(plan.toRemove ?? []).map((line) => (
                  <Text key={`rem-${line.uuid}`}>{`Remove ${line.title}`}</Text>
                ))}
              </Section>

              <Button
                title={status === "applying" ? "Applying…" : "Apply eco fees"}
                type="primary"
                isDisabled={status === "applying"}
                onPress={applyPlan}
              />
            </>
          )}

          {status !== "loading" && status !== "applying" && (
            <Button title="Re-check cart" onPress={loadPlan} />
          )}
        </ScrollView>
      </Screen>
    </Navigator>
  );
};

export default reactExtension("pos.home.modal.render", () => <EcoFeeModal />);
