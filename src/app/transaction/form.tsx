import { useEffect, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ModalLayout } from "@/components/templates/ModalLayout";
import { TransactionForm, type TransactionFormData } from "@/components/organisms/TransactionForm";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useTemplates } from "@/hooks/useTemplates";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import {
  createTransaction,
  getTransactionById,
  deleteTransaction,
} from "@/db/queries/transactions";
import { updateAccountBalance, createAccount, getAccounts } from "@/db/queries/accounts";
import { db } from "@/db/client";
import { settings, transactions, transactionSubcategories } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { PALETTE_COLORS } from "@/constants/colors";
import type { TransactionType } from "@/types";

export default function TransactionFormScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    type?: string;
    id?: string;
    accountId?: string;
    toAccountId?: string;
  }>();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { templates } = useTemplates();
  const { invalidate } = useDataRefresh();
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [autoAddLocation, setAutoAddLocation] = useState(false);
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
    db.select()
      .from(settings)
      .where(eq(settings.key, "auto_add_location"))
      .then(([s]) => {
        if (s?.value === "true") setAutoAddLocation(true);
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
            splitEnabled: false,
            splitPeople: [],
            subcategoryIds: txn.subcategoryList.map((s) => s.id),
          });
        }
        setLoaded(true);
      });
    }
  }, [params.id]);

  const handleSubmit = async (data: TransactionFormData, subcategoryIds: number[]) => {
    try {
      let txn: { id: number } | undefined;
      if (params.id) {
        // Editing existing transaction — wrapped in SQLite transaction for atomicity
        const existingId = parseInt(params.id, 10);
        const existing = await getTransactionById(existingId);
        if (existing) {
          await db.run(sql`BEGIN TRANSACTION`);
          try {
            if (existing.linkedTransactionId) {
              await deleteTransaction(existing.linkedTransactionId);
            }
            // Reverse old balance. For cross-currency transfers, the
            // destination side was credited in destination-currency units
            // (existing.toAmount), not source-currency units.
            await updateAccountBalance(
              existing.accountId,
              -existing.amount,
              existing.type as "income" | "expense" | "transfer",
              true,
            );
            if (existing.toAccountId && existing.type === "transfer") {
              const oldDestAmount = existing.toAmount ?? existing.amount;
              await updateAccountBalance(existing.toAccountId, -oldDestAmount, "transfer", false);
            }
            // Update transaction
            await db
              .update(transactions)
              .set({
                type: data.type,
                amount: data.amount,
                toAmount: data.toAmount,
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
              await db.insert(transactionSubcategories).values(
                subcategoryIds.map((subId) => ({
                  transactionId: existingId,
                  subcategoryId: subId,
                })),
              );
            }
            // Apply new balance — same toAmount-aware split for the
            // destination side as the reversal above.
            await updateAccountBalance(
              data.accountId,
              data.amount,
              data.type as "income" | "expense" | "transfer",
              true,
            );
            if (data.toAccountId && data.type === "transfer") {
              const newDestAmount = data.toAmount ?? data.amount;
              await updateAccountBalance(data.toAccountId, newDestAmount, "transfer", false);
            }
            await db.run(sql`COMMIT`);
          } catch (e) {
            await db.run(sql`ROLLBACK`);
            throw e;
          }
        }
      } else {
        // Creating new transaction
        txn = await createTransaction(data, subcategoryIds);

        // Handle instant cashback
        if (data.instantCashback && data.cashbackAmount && data.cashbackAccountId) {
          const cashbackTxn = await createTransaction(
            {
              type: "income",
              amount: data.cashbackAmount,
              description: `${t("settings.cashback")}: ${data.description}`.trim(),
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

      // Handle split bill: create loan_lent accounts for each person (new transactions only)
      if (
        !params.id &&
        data.splitEnabled &&
        data.splitPeople.length > 0 &&
        data.type === "expense"
      ) {
        const existingAccounts = await getAccounts(true);
        // txn was created above in the "Creating new transaction" block
        const originTxnId = txn?.id;
        for (const person of data.splitPeople) {
          const existing = person.contactId
            ? existingAccounts.find(
                (a) => a.type === "loan_lent" && a.counterpartyContactId === person.contactId,
              )
            : null;

          let loanAccountId: number;
          if (existing) {
            await updateAccountBalance(existing.id, person.amount, "income", false);
            loanAccountId = existing.id;
          } else {
            const loanAcc = await createAccount({
              name: t("splitBill.loanName", { name: person.name }),
              type: "loan_lent",
              balance: person.paid ? 0 : person.amount,
              currency: existingAccounts.find((a) => a.id === data.accountId)?.currency ?? "USD",
              counterparty: person.name,
              counterpartyContactId: person.contactId,
              icon: "bank-transfer-out",
              color: PALETTE_COLORS[2],
              interestRate: null,
              lastInterestDate: null,
              originTransactionId: originTxnId,
            });
            loanAccountId = loanAcc.id;
          }

          // If person already paid, create a settling transfer immediately
          if (person.paid && !existing) {
            await createTransaction(
              {
                type: "transfer",
                amount: person.amount,
                description: t("accounts.loanReceivedDesc", { name: person.name }),
                accountId: loanAccountId,
                toAccountId: data.accountId,
                date: data.date,
                time: data.time,
              },
              [],
            );
          }
        }
      }

      invalidate("transactions", "accounts");
      router.back();
    } catch (e) {
      console.error("Transaction save failed:", e);
    }
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
        templates={templates}
        onSubmit={handleSubmit}
        initialType={(params.type as TransactionType) ?? "expense"}
        initialAccountId={params.accountId ? parseInt(params.accountId, 10) : undefined}
        initialToAccountId={params.toAccountId ? parseInt(params.toAccountId, 10) : undefined}
        initialData={initialData}
        locationEnabled={locationEnabled}
        autoAddLocation={autoAddLocation}
      />
    </ModalLayout>
  );
}
