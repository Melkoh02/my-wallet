import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalLayout } from "@/components/templates/ModalLayout";
import { AccountForm } from "@/components/organisms/AccountForm";
import { ConfirmModal } from "@/components/atoms/ConfirmModal";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import {
  createAccount,
  updateAccount,
  getAccountById,
  archiveAccount,
  deleteAccountPermanently,
  accountHasTransactions,
  AccountInUseError,
} from "@/db/queries/accounts";
import type { Account, NewAccount } from "@/db/schema";

export default function AccountFormScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const { invalidate } = useDataRefresh();
  const [initial, setInitial] = useState<Account | undefined>();
  const [loaded, setLoaded] = useState(!params.id);
  const [currencyLocked, setCurrencyLocked] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"archive" | "delete" | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<{ count: number } | null>(null);

  useEffect(() => {
    if (params.id) {
      const accountId = parseInt(params.id, 10);
      Promise.all([getAccountById(accountId), accountHasTransactions(accountId)]).then(
        ([acc, hasTxns]) => {
          setInitial(acc);
          setCurrencyLocked(hasTxns);
          setLoaded(true);
        },
      );
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
    setConfirmMode(mode);
  };

  const handleConfirm = async () => {
    if (!initial || !confirmMode) return;
    if (confirmMode === "archive") {
      await archiveAccount(initial.id);
    } else {
      try {
        await deleteAccountPermanently(initial.id);
      } catch (e) {
        if (e instanceof AccountInUseError) {
          setConfirmMode(null);
          setDeleteBlocked({ count: e.txnCount });
          return;
        }
        throw e;
      }
    }
    invalidate("accounts", "transactions");
    setConfirmMode(null);
    router.dismissAll();
    router.replace("/(tabs)/accounts");
  };

  if (!loaded) return null;

  return (
    <ModalLayout
      title={initial ? t("accounts.editAccount") : t("accounts.newAccount")}
      onClose={() => router.back()}
    >
      <AccountForm
        initial={initial}
        currencyLocked={currencyLocked}
        onSubmit={handleSubmit}
        onDelete={initial ? handleDelete : undefined}
      />

      <ConfirmModal
        visible={confirmMode !== null}
        title={
          confirmMode === "archive" ? t("accounts.archiveAccount") : t("accounts.deleteAccount")
        }
        message={
          confirmMode === "archive" ? t("accounts.archiveMessage") : t("accounts.deleteMessage")
        }
        confirmLabel={confirmMode === "archive" ? t("accounts.archiveAccount") : t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmMode(null)}
      />

      <ConfirmModal
        visible={deleteBlocked !== null}
        title={t("accounts.deleteBlockedTitle")}
        message={t("accounts.deleteBlockedMessage", { count: deleteBlocked?.count ?? 0 })}
        confirmLabel={t("common.done")}
        variant="primary"
        onConfirm={() => setDeleteBlocked(null)}
      />
    </ModalLayout>
  );
}
