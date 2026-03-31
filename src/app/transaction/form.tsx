import { useRouter, useLocalSearchParams } from "expo-router";
import { ModalLayout } from "@/components/templates/ModalLayout";
import { TransactionForm } from "@/components/organisms/TransactionForm";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { createTransaction } from "@/db/queries/transactions";
import type { NewTransaction } from "@/db/schema";
import type { TransactionType } from "@/types";

export default function TransactionFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { invalidate } = useDataRefresh();

  const handleSubmit = async (data: NewTransaction, subcategoryIds: number[]) => {
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
      />
    </ModalLayout>
  );
}
