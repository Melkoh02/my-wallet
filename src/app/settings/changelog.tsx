import { useEffect, useState } from "react";
import { ScrollView, View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Asset } from "expo-asset";
import { readAsStringAsync } from "expo-file-system/legacy";
import { ScreenLayout } from "@/components/templates/ScreenLayout";
import { HeaderBar } from "@/components/templates/HeaderBar";
import { AppText } from "@/components/atoms/AppText";
import { useTheme } from "@/providers/ThemeProvider";
import { spacing } from "@/theme/spacing";

type ChangelogEntry = {
  version: string;
  date: string;
  sections: { title: string; items: string[] }[];
};

function parseChangelog(raw: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  let currentSection: { title: string; items: string[] } | null = null;

  for (const line of raw.split("\n")) {
    // Version heading: ## [1.2.0] - 2026-04-10
    const versionMatch = line.match(/^## \[(.+?)\] - (.+)/);
    if (versionMatch) {
      if (current) entries.push(current);
      current = { version: versionMatch[1], date: versionMatch[2], sections: [] };
      currentSection = null;
      continue;
    }
    if (!current) continue;

    // Section heading: ### Added / ### Fixed / ### Changed
    const sectionMatch = line.match(/^### (.+)/);
    if (sectionMatch) {
      currentSection = { title: sectionMatch[1], items: [] };
      current.sections.push(currentSection);
      continue;
    }

    // List item: - Something
    if (line.startsWith("- ") && currentSection) {
      currentSection.items.push(line.slice(2).replace(/\*\*/g, ""));
    }
  }
  if (current) entries.push(current);
  return entries;
}

export default function ChangelogScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asset = Asset.fromModule(require("../../../CHANGELOG.md"));
    asset
      .downloadAsync()
      .then(() => {
        if (asset.localUri) return readAsStringAsync(asset.localUri);
        return "";
      })
      .then((raw: string) => setEntries(parseChangelog(raw)))
      .catch(() => {});
  }, []);

  return (
    <ScreenLayout>
      <HeaderBar title={t("settings.changelog")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {entries.map((entry) => (
          <View key={entry.version} style={styles.entry}>
            <View style={styles.versionRow}>
              <AppText variant="h3">v{entry.version}</AppText>
              <AppText variant="caption" color={colors.textTertiary}>
                {entry.date}
              </AppText>
            </View>
            {entry.sections.map((section) => (
              <View key={section.title} style={styles.section}>
                <AppText variant="label" color={colors.primary}>
                  {section.title}
                </AppText>
                {section.items.map((item, i) => (
                  <View key={i} style={styles.itemRow}>
                    <AppText variant="caption" color={colors.textTertiary} style={styles.bullet}>
                      •
                    </AppText>
                    <AppText
                      variant="bodySmall"
                      color={colors.textSecondary}
                      style={styles.itemText}
                    >
                      {item}
                    </AppText>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing["2xl"],
    gap: spacing.xl,
  },
  entry: {
    gap: spacing.md,
  },
  versionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  section: {
    gap: spacing.xs,
  },
  itemRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingLeft: spacing.sm,
  },
  bullet: {
    lineHeight: 20,
  },
  itemText: {
    flex: 1,
    lineHeight: 20,
  },
});
