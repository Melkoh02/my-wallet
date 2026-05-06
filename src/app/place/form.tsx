import { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ModalLayout } from "@/components/templates/ModalLayout";
import { AppInput } from "@/components/atoms/AppInput";
import { AppButton } from "@/components/atoms/AppButton";
import { AppText } from "@/components/atoms/AppText";
import { AppIcon } from "@/components/atoms/AppIcon";
import { ConfirmModal } from "@/components/atoms/ConfirmModal";
import { useTheme } from "@/providers/ThemeProvider";
import { useDataRefresh } from "@/providers/DataRefreshProvider";
import { spacing } from "@/theme/spacing";
import {
  archivePlace,
  createPlace,
  deletePlace,
  getPlaceById,
  unarchivePlace,
  updatePlace,
} from "@/db/queries/places";
import { getCurrentLocation } from "@/services/location.service";
import type { NewPlace } from "@/db/schema";

export default function PlaceFormScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { invalidate } = useDataRefresh();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!params.id;

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  // why: distinguish "user-typed name" from "captured-by-GPS" so we know which
  // `source` to set when saving. A migrated place that the user later edits
  // keeps its 'migrated' source unless they re-capture coords.
  const [originalSource, setOriginalSource] = useState<NewPlace["source"]>("manual");
  const [coordsCapturedNow, setCoordsCapturedNow] = useState(false);

  const [fetchingCoords, setFetchingCoords] = useState(false);
  const [coordsError, setCoordsError] = useState("");
  const [archived, setArchived] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const [loaded, setLoaded] = useState(!isEditing);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      const p = await getPlaceById(parseInt(params.id!, 10));
      if (p) {
        setName(p.name);
        setAddress(p.address ?? "");
        setLatitude(p.latitude);
        setLongitude(p.longitude);
        setOriginalSource(p.source as NewPlace["source"]);
        setArchived(!p.isActive);
      }
      setLoaded(true);
    })();
  }, [params.id]);

  const handleCaptureCoords = async () => {
    setFetchingCoords(true);
    setCoordsError("");
    const stamp = await getCurrentLocation();
    setFetchingCoords(false);
    if (!stamp) {
      setCoordsError(t("places.coordsFailed"));
      return;
    }
    setLatitude(stamp.latitude);
    setLongitude(stamp.longitude);
    setCoordsCapturedNow(true);
    // Pre-fill the name with the reverse-geocoded label only if the user
    // hasn't typed anything yet — keeps manual edits sticky.
    if (!name && stamp.name) setName(stamp.name);
  };

  const handleClearCoords = () => {
    setLatitude(null);
    setLongitude(null);
    setCoordsCapturedNow(false);
  };

  const isValid = !!name.trim();

  const resolveSource = (): NewPlace["source"] => {
    if (coordsCapturedNow) return "geocoded";
    return originalSource;
  };

  const handleSubmit = async () => {
    const data: NewPlace = {
      name: name.trim(),
      address: address.trim() ? address.trim() : null,
      latitude,
      longitude,
      source: resolveSource(),
    };
    if (isEditing && params.id) {
      await updatePlace(parseInt(params.id, 10), data);
    } else {
      await createPlace(data);
    }
    invalidate("places", "transactions");
    router.back();
  };

  const handleArchive = async () => {
    if (!params.id) return;
    await archivePlace(parseInt(params.id, 10));
    invalidate("places");
    setShowArchiveConfirm(false);
    router.back();
  };

  const handleUnarchive = async () => {
    if (!params.id) return;
    await unarchivePlace(parseInt(params.id, 10));
    invalidate("places");
    router.back();
  };

  const handleDelete = async () => {
    if (!params.id) return;
    await deletePlace(parseInt(params.id, 10));
    // Linked transactions still hold a dangling place_id but display code
    // tolerates that and falls back to no name. Surface a refresh on
    // transactions as well so any visible list redraws.
    invalidate("places", "transactions");
    setShowDeleteConfirm(false);
    router.back();
  };

  if (!loaded) return null;

  const hasCoords = latitude !== null && longitude !== null;

  return (
    <ModalLayout
      title={isEditing ? t("places.editTitle") : t("places.newTitle")}
      onClose={() => router.back()}
    >
      <View style={styles.container}>
        <AppInput
          label={t("places.nameLabel")}
          value={name}
          onChangeText={setName}
          placeholder={t("places.namePlaceholder")}
        />

        <AppInput
          label={t("places.addressLabel")}
          value={address}
          onChangeText={setAddress}
          placeholder={t("places.addressPlaceholder")}
        />

        <View style={styles.section}>
          <AppText variant="caption" color={colors.textSecondary}>
            {t("places.coordsLabel")}
          </AppText>
          <View style={[styles.coordsRow, { backgroundColor: colors.card }]}>
            <AppIcon
              name={hasCoords ? "map-marker" : "map-marker-off"}
              size={22}
              color={hasCoords ? colors.primary : colors.iconSecondary}
            />
            <View style={styles.coordsText}>
              {hasCoords ? (
                <AppText variant="body">
                  {t("places.coordsCaptured", {
                    lat: latitude!.toFixed(5),
                    lng: longitude!.toFixed(5),
                  })}
                </AppText>
              ) : (
                <AppText variant="body" color={colors.textSecondary}>
                  {t("places.noCoords")}
                </AppText>
              )}
            </View>
            {hasCoords && (
              <Pressable onPress={handleClearCoords} hitSlop={8}>
                <AppIcon name="close" size={20} color={colors.iconSecondary} />
              </Pressable>
            )}
          </View>
          <AppButton
            title={fetchingCoords ? t("places.fetchingCoords") : t("places.useCurrentCoords")}
            onPress={handleCaptureCoords}
            disabled={fetchingCoords}
            variant="secondary"
            icon="crosshairs-gps"
          />
          {coordsError ? (
            <AppText variant="caption" color={colors.danger}>
              {coordsError}
            </AppText>
          ) : null}
        </View>

        <View style={styles.actions}>
          <AppButton
            title={isEditing ? t("places.saveChanges") : t("places.create")}
            onPress={handleSubmit}
            disabled={!isValid}
          />
          {isEditing && !archived && (
            <AppButton
              title={t("places.archive")}
              onPress={() => setShowArchiveConfirm(true)}
              variant="secondary"
              icon="archive"
            />
          )}
          {isEditing && archived && (
            <AppButton
              title={t("places.unarchive")}
              onPress={handleUnarchive}
              variant="secondary"
              icon="archive-arrow-up"
            />
          )}
          {isEditing && (
            <AppButton
              title={t("places.delete")}
              onPress={() => setShowDeleteConfirm(true)}
              variant="danger"
              icon="delete"
            />
          )}
        </View>
      </View>

      <ConfirmModal
        visible={showArchiveConfirm}
        title={t("places.archiveTitle")}
        message={t("places.archiveMessage", { name })}
        confirmLabel={t("places.archive")}
        cancelLabel={t("common.cancel")}
        variant="primary"
        onConfirm={handleArchive}
        onCancel={() => setShowArchiveConfirm(false)}
      />
      <ConfirmModal
        visible={showDeleteConfirm}
        title={t("places.deleteTitle")}
        message={t("places.deleteMessage", { name })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </ModalLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
    paddingBottom: spacing["2xl"],
  },
  section: {
    gap: spacing.sm,
  },
  coordsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
  },
  coordsText: {
    flex: 1,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
