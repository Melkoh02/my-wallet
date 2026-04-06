import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { ModalLayout } from "@/components/templates/ModalLayout";
import { AccountForm } from "@/components/organisms/AccountForm";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import {
  createAccount,
  updateAccount,
  getAccountById,
  archiveAccount,
  deleteAccountPermanently,
} from "@/db/queries/accounts";
import type { Account, NewAccount } from "@/db/schema";

export default function AccountFormScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const { invalidate } = useDataRefresh();
  const [initial, setInitial] = useState<Account | undefined>();
  const [loaded, setLoaded] = useState(!params.id);

  useEffect(() => {
    if (params.id) {
      getAccountById(parseInt(params.id, 10)).then((acc) => {
        setInitial(acc);
        setLoaded(true);
      });
    }
  }, [params.id]);

  const handleSubmit = async (data: NewAccount) => {
    if (initial) {
      await updateAccount(initial.id, data);
    } else {
      await createAccount(data);
    }
    invalidate("accounts", "transactions");
    router.back();
  };

  const handleDelete = (mode: "archive" | "delete") => {
    if (!initial) return;

    if (mode === "archive") {
      Alert.alert(t("accounts.archiveAccount"), t("accounts.archiveMessage"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("accounts.archiveAccount"),
          onPress: async () => {
            await archiveAccount(initial.id);
            invalidate("accounts", "transactions");
            router.back();
          },
        },
      ]);
    } else {
      Alert.alert(t("accounts.deleteAccount"), t("accounts.deleteMessage"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            await deleteAccountPermanently(initial.id);
            invalidate("accounts", "transactions");
            router.back();
          },
        },
      ]);
    }
  };

  if (!loaded) return null;

  return (
    <ModalLayout
      title={initial ? t("accounts.editAccount") : t("accounts.newAccount")}
      onClose={() => router.back()}
    >
      <AccountForm
        initial={initial}
        onSubmit={handleSubmit}
        onDelete={initial ? handleDelete : undefined}
      />
    </ModalLayout>
  );
}
