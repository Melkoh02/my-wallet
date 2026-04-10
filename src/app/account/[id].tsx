import { useEffect, useState } from "react";
import { View, FlatList, Pressable, Modal, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AmountDisplay } from "@/components/molecules/AmountDisplay";
import { SelectInput } from "@/components/molecules/SelectInput";
import { PickerModal } from "@/components/molecules/PickerModal";
import { EmptyState } from "@/components/molecules/EmptyState";
import { TransactionListItem } from "@/components/organisms/TransactionListItem";
import { AppText } from "@/components/atoms/AppText";
import { AppInput } from "@/components/atoms/AppInput";
import { AppIcon } from "@/components/atoms/AppIcon";
import { AppButton } from "@/components/atoms/AppButton";
import { Divider } from "@/components/atoms/Divider";
import { useTheme } from "@/providers/ThemeProvider";
import { usePrivacy } from "@/providers/PrivacyProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { getAccountById } from "@/db/queries/accounts";
import {
  getTransactions,
  createTransaction,
  type TransactionWithRelations,
} from "@/db/queries/transactions";
import { formatDate } from "@/utils/format";
import { spacing } from "@/theme/spacing";
import type { Account } from "@/db/schema";

const isLoanType = (t: string) => t === "loan_borrowed" || t === "loan_lent";

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { hideAmounts } = usePrivacy();
  const { revisions, invalidate } = useDataRefresh();
  const { accounts: allAccounts } = useAccounts();
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    if (id) {
      const accountId = parseInt(id, 10);
      getAccountById(accountId).then((acc) => setAccount(acc ?? null));
      getTransactions({ accountId, limit: 50 }).then(setTransactions);
    }
  }, [id, revisions.accounts, revisions.transactions]);

  if (!account) return null;

  const isLoan = isLoanType(account.type);
  const isInvestment = account.type === "investment";
  const isBorrowed = account.type === "loan_borrowed";

  const loanRemaining = isBorrowed ? Math.abs(account.balance) : account.balance;
  const loanSettled = isLoan && loanRemaining <= 0;

  const paymentAccounts = allAccounts.filter((a) => a.id !== account.id && !isLoanType(a.type));

  return (
    <ScreenLayout edges={["top"]}>
      <HeaderBar
        title={account.name}
        onBack={() => router.back()}
        rightIcon="pencil"
        onRightPress={() => router.push(`/account/form?id=${account.id}`)}
      />
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={
          <View style={styles.headerSection}>
            <View style={styles.balanceSection}>
              <AppText variant="caption" color={colors.textSecondary}>
                {isLoan
                  ? t("accounts.remaining")
                  : isInvestment
                    ? t("accounts.currentValue")
                    : account.type === "credit"
                      ? t("accounts.availableCredit")
                      : t("accounts.currentBalance")}
              </AppText>
              <AmountDisplay
                amount={isLoan ? loanRemaining : account.balance}
                currency={account.currency}
                variant="amountLarge"
                type={isBorrowed && !loanSettled ? "expense" : loanSettled ? "income" : "neutral"}
              />
              {/* #5: Use AmountDisplay for debt to respect privacy mode */}
              {account.type === "credit" && account.creditLimit != null && !hideAmounts && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <AppText variant="bodySmall" color={colors.expense}>
                    {t("accounts.debt")}:
                  </AppText>
                  <AmountDisplay
                    amount={(account.creditLimit ?? 0) - account.balance}
                    currency={account.currency}
                    type="expense"
                    variant="bodySmall"
                  />
                </View>
              )}
              {account.institution ? (
                <AppText variant="bodySmall" color={colors.textTertiary}>
                  {account.institution}
                </AppText>
              ) : null}
            </View>

            {isLoan && (
              <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
                {account.counterparty ? (
                  <View style={styles.infoRow}>
                    <AppText variant="bodySmall" color={colors.textSecondary}>
                      {t("accounts.counterparty")}
                    </AppText>
                    <AppText variant="label">{account.counterparty}</AppText>
                  </View>
                ) : null}
                {account.interestRate != null && (
                  <View style={styles.infoRow}>
                    <AppText variant="bodySmall" color={colors.textSecondary}>
                      {t("accounts.interestRate")}
                    </AppText>
                    <AppText variant="label">{account.interestRate}%</AppText>
                  </View>
                )}
                {account.dueDate ? (
                  <View style={styles.infoRow}>
                    <AppText variant="bodySmall" color={colors.textSecondary}>
                      {t("accounts.dueDate")}
                    </AppText>
                    <AppText variant="label">{formatDate(account.dueDate)}</AppText>
                  </View>
                ) : null}
                {loanSettled ? (
                  <View style={[styles.statusBadge, { backgroundColor: colors.income + "18" }]}>
                    <AppIcon name="check-circle" size={18} color={colors.income} />
                    <AppText variant="label" color={colors.income}>
                      {t("accounts.settled")}
                    </AppText>
                  </View>
                ) : (
                  <AppButton
                    title={isBorrowed ? t("accounts.makePayment") : t("accounts.receivePayment")}
                    icon={isBorrowed ? "cash-minus" : "cash-plus"}
                    onPress={() => setShowPaymentModal(true)}
                  />
                )}
              </View>
            )}

            {isInvestment && account.interestRate != null && (
              <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
                <View style={styles.infoRow}>
                  <AppText variant="bodySmall" color={colors.textSecondary}>
                    {t("accounts.interestRate")}
                  </AppText>
                  <AppText variant="label">{account.interestRate}%</AppText>
                </View>
              </View>
            )}

            <Divider style={styles.divider} />
          </View>
        }
        renderItem={({ item }) => (
          <TransactionListItem
            transaction={item}
            onPress={() => router.push(`/transaction/${item.id}`)}
          />
        )}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={
          <EmptyState
            icon="swap-horizontal"
            title={t("home.noTransactionsYet")}
            description={t("transactions.addFirst")}
          />
        }
      />

      {isLoan && !loanSettled && (
        <PaymentModal
          visible={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          loanAccount={account}
          paymentAccounts={paymentAccounts}
          isBorrowed={isBorrowed}
          remaining={loanRemaining}
          onPayment={async (amount, paymentAccountId) => {
            try {
              await createTransaction(
                {
                  type: "transfer",
                  amount,
                  description: isBorrowed
                    ? t("accounts.loanPaymentDesc", { name: account.name })
                    : t("accounts.loanReceivedDesc", { name: account.name }),
                  accountId: isBorrowed ? paymentAccountId : account.id,
                  toAccountId: isBorrowed ? account.id : paymentAccountId,
                  date: new Date().toISOString().slice(0, 10),
                  time: new Date().toTimeString().slice(0, 5),
                },
                [],
              );
              invalidate("accounts", "transactions");
            } catch (e) {
              console.error("Payment failed:", e);
            } finally {
              setShowPaymentModal(false);
            }
          }}
        />
      )}
    </ScreenLayout>
  );
}

/* ---------- Payment Modal ---------- */
function PaymentModal({
  visible,
  onClose,
  loanAccount,
  paymentAccounts,
  isBorrowed,
  remaining,
  onPayment,
}: {
  visible: boolean;
  onClose: () => void;
  loanAccount: Account;
  paymentAccounts: Account[];
  isBorrowed: boolean;
  remaining: number;
  onPayment: (amount: number, paymentAccountId: number) => Promise<void>;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
    paymentAccounts[0]?.id ?? null,
  );
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  const selectedAccount = paymentAccounts.find((a) => a.id === selectedAccountId);
  const parsed = parseFloat(amount) || 0;
  // #2: Cap at remaining balance
  const isValid = parsed > 0 && parsed <= remaining && selectedAccountId !== null;

  const handlePayFull = () => {
    setAmount(remaining.toString());
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      {/* #10: SafeAreaView */}
      <SafeAreaView style={{ flex: 1 }}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <View
            style={[styles.modalContent, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <AppText variant="h3">
              {isBorrowed ? t("accounts.makePayment") : t("accounts.receivePayment")}
            </AppText>

            {/* #5: Use AmountDisplay for remaining to respect privacy */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <AppText variant="bodySmall" color={colors.textSecondary}>
                {t("accounts.remaining")}:
              </AppText>
              <AmountDisplay
                amount={remaining}
                currency={loanAccount.currency}
                variant="bodySmall"
              />
            </View>

            <View style={styles.amountRow}>
              <View style={{ flex: 1 }}>
                <AppInput
                  label={t("transactionForm.amount")}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  autoFocus
                />
              </View>
              <AppButton
                title={t("accounts.payFull")}
                variant="ghost"
                onPress={handlePayFull}
                style={{ marginTop: 20 }}
              />
            </View>

            {parsed > remaining && (
              <AppText variant="caption" color={colors.danger}>
                {t("accounts.exceedsRemaining")}
              </AppText>
            )}

            <SelectInput
              label={isBorrowed ? t("accounts.payFrom") : t("accounts.receiveTo")}
              value={
                selectedAccount ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <AppIcon name={selectedAccount.icon} size={18} color={selectedAccount.color} />
                    <AppText variant="body">{selectedAccount.name}</AppText>
                  </View>
                ) : undefined
              }
              placeholder={t("common.select")}
              onPress={() => setShowAccountPicker(true)}
            />

            <View style={styles.paymentActions}>
              <AppButton
                title={t("common.cancel")}
                variant="ghost"
                onPress={onClose}
                style={{ flex: 1 }}
              />
              <AppButton
                title={t("common.confirm")}
                onPress={() => onPayment(parsed, selectedAccountId!)}
                disabled={!isValid}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </Pressable>
      </SafeAreaView>

      {/* #18: PickerModal inside the Modal to avoid z-index issues */}
      <PickerModal
        visible={showAccountPicker}
        title={isBorrowed ? t("accounts.payFrom") : t("accounts.receiveTo")}
        items={paymentAccounts}
        keyExtractor={(item) => item.id.toString()}
        selectedKey={selectedAccountId?.toString()}
        onSelect={(item) => setSelectedAccountId(item.id)}
        onClose={() => setShowAccountPicker(false)}
        renderItem={(item, isSelected) => (
          <>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: item.color + "20",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AppIcon name={item.icon} size={20} color={item.color} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="body">{item.name}</AppText>
              {item.institution ? (
                <AppText variant="caption" color={colors.textSecondary}>
                  {item.institution}
                </AppText>
              ) : null}
            </View>
            {isSelected && <AppIcon name="check" size={20} color={colors.primary} />}
          </>
        )}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  headerSection: { paddingBottom: spacing.sm },
  balanceSection: {
    alignItems: "center",
    paddingVertical: spacing["2xl"],
    gap: spacing.xs,
  },
  infoCard: {
    marginHorizontal: spacing.lg,
    borderRadius: 12,
    padding: spacing.lg,
    gap: spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 10,
  },
  divider: { marginTop: spacing.lg, alignSelf: "stretch" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  modalContent: {
    width: "100%",
    borderRadius: 16,
    padding: spacing.xl,
    gap: spacing.md,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  paymentActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
});
