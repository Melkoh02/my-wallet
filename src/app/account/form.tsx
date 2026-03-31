import { useRouter, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ModalLayout } from "@/components/templates/ModalLayout";
import { AccountForm } from "@/components/organisms/AccountForm";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import {
  createAccount,
  updateAccount,
  getAccountById,
  archiveAccount,
} from "@/db/queries/accounts";
import type { Account, NewAccount } from "@/db/schema";

export default function AccountFormScreen() {
  const router = useRouter();
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

  const handleDelete = async () => {
    if (initial) {
      await archiveAccount(initial.id);
      invalidate("accounts", "transactions");
      router.back();
    }
  };

  if (!loaded) return null;

  return (
    <ModalLayout title={initial ? "Edit Account" : "New Account"} onClose={() => router.back()}>
      <AccountForm
        initial={initial}
        onSubmit={handleSubmit}
        onDelete={initial ? handleDelete : undefined}
      />
    </ModalLayout>
  );
}
