import { useEffect, useState } from "react";
import { FlatList } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { TransactionListItem } from "@/components/organisms/TransactionListItem";
import { EmptyState } from "@/components/molecules/EmptyState";
import { Divider } from "@/components/atoms/Divider";
import { getTransactions, type TransactionWithRelations } from "@/db/queries/transactions";

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string; name?: string }>();
  const params = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const [transactions, setTransactions] = useState<TransactionWithRelations[]>([]);

  useEffect(() => {
    // We filter by contact_id via a direct query
    if (id) {
      getTransactions({ limit: 100 }).then((all) => {
        setTransactions(all.filter((t) => t.contactId === id));
      });
    }
  }, [id]);

  return (
    <ScreenLayout>
      <HeaderBar title={params.name || "Contact"} onBack={() => router.back()} />
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TransactionListItem
            transaction={item}
            onPress={() => router.push(`/transaction/${item.id}`)}
          />
        )}
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={
          <EmptyState
            icon="account"
            title="No transactions"
            description="No transactions found with this contact"
          />
        }
      />
    </ScreenLayout>
  );
}
