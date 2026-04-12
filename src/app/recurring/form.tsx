import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ModalLayout } from "@/components/templates/ModalLayout";
import { RecurringForm } from "@/components/organisms/RecurringForm";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { createRecurring } from "@/db/queries/recurring";
import type { NewRecurringTransaction } from "@/db/schema";

export default function RecurringFormScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { invalidate } = useDataRefresh();

  const handleSubmit = async (data: NewRecurringTransaction, subcategoryIds: number[]) => {
    await createRecurring(data, subcategoryIds);
    invalidate("recurring");
    router.back();
  };

  return (
    <ModalLayout title={t("recurring.newRecurring")} onClose={() => router.back()}>
      <RecurringForm accounts={accounts} categories={categories} onSubmit={handleSubmit} />
    </ModalLayout>
  );
}
