import { useEffect, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ModalLayout } from "@/components/templates/ModalLayout";
import { RecurringForm } from "@/components/organisms/RecurringForm";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import {
  createRecurring,
  updateRecurring,
  getRecurringById,
  getRecurringSubcategoryIds,
} from "@/db/queries/recurring";
import type { NewRecurringTransaction, RecurringTransaction } from "@/db/schema";

export default function RecurringFormScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { invalidate } = useDataRefresh();
  const [initial, setInitial] = useState<
    (RecurringTransaction & { subcategoryIds: number[] }) | undefined
  >();
  const [loaded, setLoaded] = useState(!params.id);

  useEffect(() => {
    if (params.id) {
      const rid = parseInt(params.id, 10);
      Promise.all([getRecurringById(rid), getRecurringSubcategoryIds(rid)]).then(
        ([rec, subIds]) => {
          if (rec) setInitial({ ...rec, subcategoryIds: subIds });
          setLoaded(true);
        },
      );
    }
  }, [params.id]);

  const handleSubmit = async (data: NewRecurringTransaction, subcategoryIds: number[]) => {
    try {
      if (initial) {
        await updateRecurring(initial.id, data, subcategoryIds);
      } else {
        await createRecurring(data, subcategoryIds);
      }
      invalidate("recurring");
      router.back();
    } catch (e) {
      console.error("Recurring save failed:", e);
    }
  };

  if (!loaded) return null;

  const isEditing = !!params.id;

  return (
    <ModalLayout
      title={isEditing ? t("recurring.editRecurring") : t("recurring.newRecurring")}
      onClose={() => router.back()}
    >
      <RecurringForm
        accounts={accounts}
        categories={categories}
        onSubmit={handleSubmit}
        initial={initial}
      />
    </ModalLayout>
  );
}
