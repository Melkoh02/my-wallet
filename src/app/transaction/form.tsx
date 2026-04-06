import { useEffect, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ModalLayout } from "@/components/templates/ModalLayout";
import { TransactionForm, type TransactionFormData } from "@/components/organisms/TransactionForm";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { createTransaction, getTransactionById } from "@/db/queries/transactions";
import { updateAccountBalance } from "@/db/queries/accounts";
import { db } from "@/db/client";
import { settings, transactions, transactionSubcategories } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { TransactionType } from "@/types";

export default function TransactionFormScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { invalidate } = useDataRefresh();
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [initialData, setInitialData] = useState<
    (TransactionFormData & { subcategoryIds: number[] }) | undefined
  >();
  const [loaded, setLoaded] = useState(!params.id);

  useEffect(() => {
    db.select()
      .from(settings)
      .where(eq(settings.key, "location_enabled"))
      .then(([s]) => {
        if (s?.value === "true") setLocationEnabled(true);
      });
  }, []);

  // Load existing transaction for editing
  useEffect(() => {
    if (params.id) {
      getTransactionById(parseInt(params.id, 10)).then((txn) => {
        if (txn) {
          setInitialData({
            ...txn,
            cashbackEnabled: (txn.cashbackAmount ?? 0) > 0,
            cashbackMode: "flat",
            cashbackValue: txn.cashbackAmount ?? 0,
            instantCashback: false,
            subcategoryIds: txn.subcategoryList.map((s) => s.id),
          });
        }
        setLoaded(true);
      });
    }
  }, [params.id]);

  const handleSubmit = async (data: TransactionFormData, subcategoryIds: number[]) => {
    if (params.id) {
      // Editing existing transaction — update in place
      const existingId = parseInt(params.id, 10);
      const existing = await getTransactionById(existingId);
      if (existing) {
        // Reverse old balance
        await updateAccountBalance(
          existing.accountId,
          -existing.amount,
          existing.type as "income" | "expense" | "transfer",
          true,
        );
        if (existing.toAccountId && existing.type === "transfer") {
          await updateAccountBalance(existing.toAccountId, -existing.amount, "transfer", false);
        }
        // Update transaction
        await db
          .update(transactions)
          .set({
            type: data.type,
            amount: data.amount,
            description: data.description,
            accountId: data.accountId,
            toAccountId: data.toAccountId,
            date: data.date,
            time: data.time,
            notes: data.notes,
            contactId: data.contactId,
            contactName: data.contactName,
            latitude: data.latitude,
            longitude: data.longitude,
            locationName: data.locationName,
            cashbackAmount: data.cashbackAmount,
            cashbackAccountId: data.cashbackAccountId,
          })
          .where(eq(transactions.id, existingId));
        // Update subcategories
        await db
          .delete(transactionSubcategories)
          .where(eq(transactionSubcategories.transactionId, existingId));
        if (subcategoryIds.length > 0) {
          await db
            .insert(transactionSubcategories)
            .values(
              subcategoryIds.map((subId) => ({ transactionId: existingId, subcategoryId: subId })),
            );
        }
        // Apply new balance
        await updateAccountBalance(
          data.accountId,
          data.amount,
          data.type as "income" | "expense" | "transfer",
          true,
        );
        if (data.toAccountId && data.type === "transfer") {
          await updateAccountBalance(data.toAccountId, data.amount, "transfer", false);
        }
      }
    } else {
      // Creating new transaction
      const txn = await createTransaction(data, subcategoryIds);

      // Handle instant cashback
      if (data.instantCashback && data.cashbackAmount && data.cashbackAccountId) {
        const cashbackTxn = await createTransaction(
          {
            type: "income",
            amount: data.cashbackAmount,
            description: `Cashback: ${data.description}`.trim(),
            accountId: data.cashbackAccountId,
            date: data.date,
            time: data.time,
            linkedTransactionId: txn.id,
          },
          [],
        );
        // Link original to cashback transaction
        await db
          .update(transactions)
          .set({ linkedTransactionId: cashbackTxn.id })
          .where(eq(transactions.id, txn.id));
      }
    }

    invalidate("transactions", "accounts");
    router.back();
  };

  if (!loaded) return null;

  const isEditing = !!params.id;

  return (
    <ModalLayout
      title={isEditing ? t("transactionForm.editTransaction") : t("transactionForm.newTransaction")}
      onClose={() => router.back()}
    >
      <TransactionForm
        accounts={accounts}
        categories={categories}
        onSubmit={handleSubmit}
        initialType={(params.type as TransactionType) ?? "expense"}
        initialData={initialData}
        locationEnabled={locationEnabled}
      />
    </ModalLayout>
  );
}
