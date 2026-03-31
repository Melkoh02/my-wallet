import { useEffect, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ModalLayout } from "@/components/templates/ModalLayout";
import { TransactionForm } from "@/components/organisms/TransactionForm";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { createTransaction } from "@/db/queries/transactions";
import { computeCashback } from "@/db/queries/cashback";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { NewTransaction } from "@/db/schema";
import type { TransactionType } from "@/types";

export default function TransactionFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { invalidate } = useDataRefresh();
  const [locationEnabled, setLocationEnabled] = useState(false);

  useEffect(() => {
    db.select()
      .from(settings)
      .where(eq(settings.key, "location_enabled"))
      .then(([s]) => {
        if (s?.value === "true") setLocationEnabled(true);
      });
  }, []);

  const handleSubmit = async (data: NewTransaction, subcategoryIds: number[]) => {
    // Auto-apply cashback rules
    if (data.type === "expense" && data.accountId && subcategoryIds.length > 0) {
      const cashback = await computeCashback(data.accountId, subcategoryIds, data.amount);
      if (cashback) {
        data.cashbackAmount = cashback.amount;
        data.cashbackAccountId = cashback.cashbackAccountId;
      }
    }

    await createTransaction(data, subcategoryIds);
    invalidate("transactions", "accounts");
    router.back();
  };

  return (
    <ModalLayout title="New Transaction" onClose={() => router.back()}>
      <TransactionForm
        accounts={accounts}
        categories={categories}
        onSubmit={handleSubmit}
        initialType={(params.type as TransactionType) ?? "expense"}
        locationEnabled={locationEnabled}
      />
    </ModalLayout>
  );
}
