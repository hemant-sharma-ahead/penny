import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, Pressable, Image, ScrollView, ActivityIndicator, TextInput as RNTextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, PageHeader, Banner, LifeRow, OptionalSeg } from '~/components/ui';
import { BackButton } from '~/components/shared';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { profileRepo } from '@/core/db/repositories';
import { logActivity } from '@/core/db/activityLog';
import { reseedForEmployment } from '@/core/db/seedDemoData';
import type { EmploymentType, GoalRisk, Profile } from '@/core/db/types';
import { EMPLOYMENT_OPTIONS } from '@/core/profile/employment';
import { isValidUsername } from '@/core/profile/username';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { deriveAge, deriveAgeBand } from '@/lib/date';
import { pickReceiptPhoto } from '~/lib/receiptImage';
import { checkUsername, claimAccount, UsernameTakenError } from '@/core/identity/claim';
import { getBackupTarget } from '@/core/sync/backupPrefs';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '~/context/ToastContext';
import { useModeBackgroundColor } from '~/theme/useModeBackgroundColor';

/**
 * RN port of apps/web-legacy/src/features/profile/ProfilePage.tsx. Deviations:
 * - The avatar picker uses a *real* photo (web's `<input type="file">` + `fileToReceiptDataUrl`, not a
 *   color-swatch/icon grid) — reused Expenses' `pickReceiptPhoto` (`~/lib/receiptImage.ts`, built on
 *   `expo-image-picker`+`expo-image-manipulator`) for the same "downscaled JPEG data URL" shape web
 *   stores, instead of building a second image-picker helper.
 * - `getBackupTarget` (`@/core/sync/backupPrefs`) had a synchronous `localStorage` call with no RN
 *   equivalent — its `.native.ts` sibling keeps the same sync signature backed by an in-memory var,
 *   now hydrated from/written through to AsyncStorage since Backup & Restore was ported (see that
 *   file's own comment). Not anticipated in the original plan.
 * - `grid-cols-5` employment picker → `flex-row flex-wrap`, established Track 4 pattern.
 * - Web's native `<input type="date">` DOB field becomes a plain digit-entry `YYYY-MM-DD` text field —
 *   no RN native date-picker dependency has been introduced anywhere in this migration yet; a real
 *   calendar picker is a UI-polish follow-up, not blocking this port.
 */
export function ProfilePage() {
  const modeBg = useModeBackgroundColor();
  const { profile, loading } = useProfile();

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: modeBg }}>
      <PageHeader leading={<BackButton />} title="Edit profile" />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color="#00a86b" />
        </View>
      ) : profile ? (
        <ProfileEditor key={profile.id} profile={profile} />
      ) : (
        <Text className="px-4 py-8 text-sm text-tertiary text-center">No profile found.</Text>
      )}
    </SafeAreaView>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <View className="rounded-2xl bg-surface border border-theme px-4">{children}</View>;
}

function Field({
  label,
  required,
  trailing,
  children
}: {
  label: string;
  required?: boolean;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const theme = useThemeColors();
  return (
    <View className="py-3 border-t border-theme">
      <View className="flex-row items-center justify-between gap-2 mb-0.5" style={{ minHeight: 20 }}>
        <Text className="text-[11px] font-semibold text-tertiary">
          {label}
          {required && <Text style={{ color: theme.danger }}> *</Text>}
        </Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <Text className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mt-5 mb-2">{children}</Text>;
}

function ProfileEditor({ profile }: { profile: Profile }) {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const theme = useThemeColors();
  const { showToast } = useToast();
  const syncOn = hasEntitlement('sync');

  const [avatarDataUrl, setAvatarDataUrl] = useState(profile.avatarDataUrl ?? '');
  const [fullName, setFullName] = useState(profile.displayName ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [dob, setDob] = useState(profile.dob ?? '');
  const [employmentType, setEmploymentType] = useState<EmploymentType | undefined>(profile.employmentType);
  const [maritalStatus, setMaritalStatus] = useState<'single' | 'married' | undefined>(profile.maritalStatus);
  const [children, setChildren] = useState<number[]>(profile.children ?? []);
  const [homeOwner, setHomeOwner] = useState<boolean | undefined>(profile.homeOwner);
  const [riskAppetite, setRiskAppetite] = useState<GoalRisk | undefined>(profile.riskAppetite);
  const [childYear, setChildYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reseeded, setReseeded] = useState(false);

  const [claimed, setClaimed] = useState(Boolean(profile.deviceId));
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleDraft, setHandleDraft] = useState('');
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [handleBusy, setHandleBusy] = useState(false);
  const [handleError, setHandleError] = useState<string | undefined>();
  const [pickingPhoto, setPickingPhoto] = useState(false);

  const age = dob ? deriveAge(dob) : null;
  const dobValid = dob === '' || (age !== null && age >= 13 && age <= 120);
  const ageBand = dob && dobValid ? deriveAgeBand(dob) : null;
  const usernameValid = username === '' || isValidUsername(username);
  const canSave = fullName.trim().length > 0 && dobValid && usernameValid && !saving;
  const planLabel = profile.plan && profile.plan !== 'free' ? profile.plan : 'Free plan';

  function edited<T>(setter: (v: T) => void) {
    return (v: T) => {
      setSaved(false);
      setter(v);
    };
  }

  async function onPickPhoto() {
    setPickingPhoto(true);
    try {
      const url = await pickReceiptPhoto();
      if (url) {
        setAvatarDataUrl(url);
        setSaved(false);
      }
    } finally {
      setPickingPhoto(false);
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const employmentChanged = employmentType !== profile.employmentType;
      await profileRepo.put({
        ...profile,
        displayName: fullName.trim(),
        // When claimed, the username is owned by the claim flow (server) — don't overwrite it here.
        username: claimed ? profile.username : username.trim() || undefined,
        dob: dob || undefined,
        avatarDataUrl: avatarDataUrl || undefined,
        employmentType,
        maritalStatus,
        children: children.length ? children : undefined,
        homeOwner,
        riskAppetite,
        updatedAt: Date.now()
      });
      logActivity({ action: 'UPDATE', entityType: 'profile', entityId: profile.id, summary: 'Updated profile' });
      const didReseed = employmentChanged && employmentType ? await reseedForEmployment(employmentType) : false;
      setSaved(true);
      setReseeded(didReseed);
    } catch {
      showToast({ message: "Couldn't save your profile. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function handleClaim() {
    if (!isValidUsername(username)) {
      setHandleError('3–20 lowercase letters, numbers, or _');
      return;
    }
    setHandleBusy(true);
    setHandleError(undefined);
    try {
      await claimAccount(username);
      setClaimed(true);
    } catch (err) {
      setHandleError(
        err instanceof UsernameTakenError
          ? "Already taken. If it's your own from another device, restore a backup to recover it — it can't be reclaimed here."
          : 'Could not claim. Try again.'
      );
    } finally {
      setHandleBusy(false);
    }
  }

  // Debounced availability check while changing an existing handle.
  useEffect(() => {
    if (!editingHandle || !handleDraft || !isValidUsername(handleDraft) || handleDraft === username) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setAvailability('checking');
      void checkUsername(handleDraft)
        .then((r) => !cancelled && setAvailability(r.available ? 'available' : 'taken'))
        .catch(() => !cancelled && setAvailability('idle'));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [editingHandle, handleDraft, username]);

  async function handleUpdateHandle() {
    if (availability !== 'available' || handleBusy) return;
    setHandleBusy(true);
    setHandleError(undefined);
    try {
      await claimAccount(handleDraft);
      setUsername(handleDraft);
      setEditingHandle(false);
    } catch (err) {
      setHandleError(
        err instanceof UsernameTakenError
          ? "Already taken. If it's your own from another device, restore a backup to recover it — it can't be reclaimed here."
          : 'Could not update. Try again.'
      );
    } finally {
      setHandleBusy(false);
    }
  }

  function addChild() {
    const yr = Number(childYear);
    const thisYear = new Date().getFullYear();
    if (yr >= 1950 && yr <= thisYear && !children.includes(yr)) {
      setSaved(false);
      setChildren([...children, yr].sort((a, b) => a - b));
    }
    setChildYear('');
  }

  const initial = (fullName.trim() || username || '?').charAt(0).toUpperCase();
  const heroHandle = [claimed && username ? `@${username}` : null, planLabel].filter(Boolean).join(' · ');
  // A claimed account is only recoverable with an OFF-device backup (Drive/iCloud). 'local'/null don't
  // survive reinstall — nudge the user to set one up right after they claim (Track F, F2c).
  const backupTarget = getBackupTarget();
  const backupIsRecoverable = backupTarget === 'google-drive' || backupTarget === 'icloud';
  const showBackupNudge = syncOn && claimed && !backupIsRecoverable;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
      <View className="px-4 py-4">
        {saved && (
          <Banner variant="success">
            Profile saved.{reseeded ? ' Sample data refreshed to match your new profile.' : ''}
          </Banner>
        )}

        {/* Identity hero */}
        <View className="flex-row items-center gap-4 py-2">
          <Pressable
            onPress={() => void onPickPhoto()}
            disabled={pickingPhoto}
            accessibilityLabel="Change profile photo"
          >
            <View
              className="w-16 h-16 rounded-full items-center justify-center overflow-hidden"
              style={{ backgroundColor: theme.primary }}
            >
              {avatarDataUrl ? (
                <Image source={{ uri: avatarDataUrl }} className="w-full h-full" resizeMode="cover" />
              ) : (
                <Text className="text-white text-2xl font-bold">{initial}</Text>
              )}
            </View>
            <View className="absolute -right-0.5 -bottom-0.5 w-6 h-6 rounded-full bg-surface border border-theme items-center justify-center">
              <Icon name="ti-camera" size={12} color={theme.textSecondary} />
            </View>
          </Pressable>
          <View className="min-w-0 flex-1">
            <Text className="text-lg font-bold text-primary" numberOfLines={1}>
              {fullName.trim() || 'Your account'}
            </Text>
            {heroHandle && (
              <Text className="text-xs text-secondary" numberOfLines={1}>
                {heroHandle}
              </Text>
            )}
            {syncOn && (
              <View
                className="flex-row items-center gap-1 self-start rounded-full px-2 py-0.5 mt-1.5"
                style={{ backgroundColor: claimed ? `${theme.success}1a` : theme.surfaceSecondary }}
              >
                <Icon
                  name={claimed ? 'ti-circle-check' : 'ti-circle-dashed'}
                  size={11}
                  color={claimed ? theme.success : theme.textTertiary}
                />
                <Text
                  className="text-[10.5px] font-bold"
                  style={{ color: claimed ? theme.success : theme.textTertiary }}
                >
                  {claimed ? 'Claimed on this device' : 'Not claimed yet'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Your details */}
        <SectionLabel>Your details</SectionLabel>
        <Card>
          <Field label="Full name" required>
            <RNTextInput
              className="text-[15px] text-primary p-0"
              style={{ color: theme.textPrimary }}
              value={fullName}
              onChangeText={(v) => edited(setFullName)(v)}
              placeholder="Your name"
              placeholderTextColor={theme.textTertiary}
            />
          </Field>
          <Field
            label="Date of birth"
            trailing={
              ageBand ? (
                <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${theme.primary}1a` }}>
                  <Text className="text-[10.5px] font-bold" style={{ color: theme.primary }}>
                    age band {ageBand}
                  </Text>
                </View>
              ) : undefined
            }
          >
            <RNTextInput
              className="text-[15px] p-0"
              style={{ color: theme.textPrimary }}
              value={dob}
              onChangeText={(v) => edited(setDob)(v)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textTertiary}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
          </Field>
        </Card>
        {dob !== '' && !dobValid && (
          <Text className="text-[11px] mt-1.5 px-1" style={{ color: theme.danger }}>
            Enter a valid date of birth.
          </Text>
        )}
        <Text className="text-[11px] text-tertiary mt-1.5 px-1">
          Personalises FIRE, retirement &amp; tax context. Only a 5-year age band is shared with Chip.
        </Text>

        {/* Sharing / account */}
        <SectionLabel>{syncOn ? 'Sharing & account' : 'Sharing'}</SectionLabel>
        <Card>
          {syncOn && claimed && !editingHandle ? (
            <Field
              label="Username"
              trailing={
                <Pressable
                  onPress={() => {
                    setEditingHandle(true);
                    setHandleDraft(username);
                    setHandleError(undefined);
                  }}
                  className="flex-row items-center gap-1"
                >
                  <Icon name="ti-pencil" size={12} color={theme.primary} />
                  <Text className="text-xs font-bold" style={{ color: theme.primary }}>
                    Change
                  </Text>
                </Pressable>
              }
            >
              <Text className="text-[15px] font-semibold text-primary">@{username}</Text>
            </Field>
          ) : syncOn && claimed && editingHandle ? (
            <Field
              label="New username"
              trailing={
                availability === 'checking' ? (
                  <Text className="text-[10.5px] text-tertiary">Checking…</Text>
                ) : availability === 'available' ? (
                  <Text className="text-[10.5px] font-bold" style={{ color: theme.success }}>
                    Available
                  </Text>
                ) : availability === 'taken' ? (
                  <Text className="text-[10.5px] font-bold" style={{ color: theme.danger }}>
                    Taken
                  </Text>
                ) : undefined
              }
            >
              <RNTextInput
                className="text-[15px] p-0"
                style={{ color: theme.textPrimary }}
                value={handleDraft}
                autoFocus
                onChangeText={(v) => {
                  setHandleDraft(v.toLowerCase());
                  setAvailability('idle');
                }}
                placeholder="new_handle"
                placeholderTextColor={theme.textTertiary}
              />
            </Field>
          ) : (
            <Field
              label="Username (optional)"
              trailing={
                syncOn && !claimed ? (
                  <Pressable
                    onPress={() => void handleClaim()}
                    disabled={handleBusy || !isValidUsername(username)}
                    className="rounded-full px-3 py-1 flex-row items-center gap-1"
                    style={{
                      backgroundColor: theme.primary,
                      opacity: handleBusy || !isValidUsername(username) ? 0.4 : 1
                    }}
                  >
                    <Icon name="ti-shield-check" size={12} color="#fff" />
                    <Text className="text-[11px] font-extrabold text-white">{handleBusy ? 'Claiming…' : 'Claim'}</Text>
                  </Pressable>
                ) : undefined
              }
            >
              <RNTextInput
                className="text-[15px] p-0"
                style={{ color: theme.textPrimary }}
                value={username}
                onChangeText={(v) => edited((val: string) => setUsername(val))(v.toLowerCase())}
                placeholder="e.g. aarav_s"
                placeholderTextColor={theme.textTertiary}
              />
            </Field>
          )}
        </Card>
        {editingHandle && (
          <View className="flex-row gap-2 mt-2">
            <Button variant="secondary" className="flex-1" onPress={() => setEditingHandle(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={availability !== 'available' || handleBusy}
              onPress={() => void handleUpdateHandle()}
            >
              {handleBusy ? 'Updating…' : 'Update handle'}
            </Button>
          </View>
        )}
        {handleError && (
          <Text className="text-[11px] mt-1.5 px-1" style={{ color: theme.danger }}>
            {handleError}
          </Text>
        )}
        {!usernameValid && !editingHandle && (
          <Text className="text-[11px] mt-1.5 px-1" style={{ color: theme.danger }}>
            3–20 lowercase letters, numbers, or _.
          </Text>
        )}
        <Text className="text-[11px] text-tertiary mt-1.5 px-1">
          {syncOn
            ? 'Your public handle for household sharing. It can never decrypt your data.'
            : 'A provisional handle — confirmed on the server when you enable sharing later.'}
        </Text>

        {showBackupNudge && (
          <View className="mt-3">
            <Banner variant="warning">
              <View className="gap-2">
                <Text className="text-xs leading-relaxed" style={{ color: theme.textPrimary }}>
                  Turn on cloud backup so you can recover your account if you reinstall or switch devices. Without it,
                  your data and this handle can't be restored.
                </Text>
                <Button variant="primary" className="self-start" onPress={() => navigation.navigate('Backup')}>
                  Set up backup
                </Button>
              </View>
            </Banner>
          </View>
        )}

        {/* Employment */}
        <SectionLabel>Employment</SectionLabel>
        <View className="flex-row flex-wrap gap-2.5">
          {EMPLOYMENT_OPTIONS.map((o) => {
            const on = employmentType === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => {
                  setSaved(false);
                  setEmploymentType(o.value);
                }}
                accessibilityState={{ selected: on }}
                className="items-center gap-1.5"
                style={{ width: 56 }}
              >
                <View
                  className="w-12 h-12 rounded-2xl items-center justify-center border"
                  style={{
                    backgroundColor: on ? theme.primary : theme.surface,
                    borderColor: on ? theme.primary : theme.border
                  }}
                >
                  <Icon name={o.icon} size={20} color={on ? '#fff' : theme.textTertiary} />
                </View>
                <Text
                  className="text-[9px] font-medium text-center leading-tight"
                  style={{ color: on ? theme.textSecondary : theme.textTertiary }}
                >
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="text-[11px] text-tertiary mt-2 px-1">
          Affects EPF visibility, tax notes &amp; health benchmarks.
        </Text>

        {/* Life & household — opt-in; unlocks personalized life-stage goals & guidance */}
        <SectionLabel>Life &amp; household</SectionLabel>
        <Card>
          <Text className="text-[11px] text-tertiary leading-relaxed py-3">
            Optional — add these to unlock personalized goals (a child's education corpus, the right cover, a retirement
            target). Stored encrypted on your device; only a 5-year age band ever reaches Chip.
          </Text>
          <LifeRow icon="ti-heart" label="Relationship">
            <OptionalSeg
              options={[
                { value: 'single', label: 'Single' },
                { value: 'married', label: 'Married' }
              ]}
              value={maritalStatus}
              onChange={(v) => {
                setSaved(false);
                setMaritalStatus(v as 'single' | 'married' | undefined);
              }}
            />
          </LifeRow>
          <LifeRow icon="ti-home" label="Home">
            <OptionalSeg
              options={[
                { value: 'own', label: 'Own' },
                { value: 'rent', label: 'Rent' }
              ]}
              value={homeOwner === undefined ? undefined : homeOwner ? 'own' : 'rent'}
              onChange={(v) => {
                setSaved(false);
                setHomeOwner(v === undefined ? undefined : v === 'own');
              }}
            />
          </LifeRow>
          <LifeRow icon="ti-chart-line" label="Risk appetite">
            <OptionalSeg
              options={[
                { value: 'conservative', label: 'Low' },
                { value: 'moderate', label: 'Med' },
                { value: 'aggressive', label: 'High' }
              ]}
              value={riskAppetite}
              onChange={(v) => {
                setSaved(false);
                setRiskAppetite(v as GoalRisk | undefined);
              }}
            />
          </LifeRow>
          <LifeRow icon="ti-baby-carriage" label="Children" alignTop>
            <View className="flex-row flex-wrap items-center justify-end gap-1.5" style={{ maxWidth: 220 }}>
              {children.map((yr, i) => (
                <View
                  key={`${yr}-${i}`}
                  className="flex-row items-center gap-1 rounded-full pl-2.5 pr-1.5 py-1 bg-surface-2"
                >
                  <Text className="text-xs font-semibold text-secondary">{yr}</Text>
                  <Pressable
                    accessibilityLabel={`Remove ${yr}`}
                    onPress={() => {
                      setSaved(false);
                      setChildren(children.filter((_, idx) => idx !== i));
                    }}
                  >
                    <Icon name="ti-x" size={13} color={theme.textTertiary} />
                  </Pressable>
                </View>
              ))}
              <RNTextInput
                value={childYear}
                onChangeText={(v) => setChildYear(v.replace(/\D/g, '').slice(0, 4))}
                onSubmitEditing={addChild}
                keyboardType="numeric"
                placeholder="+ year"
                placeholderTextColor={theme.textTertiary}
                className="text-sm text-right py-0.5"
                style={{ width: 64, color: theme.textPrimary, borderBottomWidth: 1, borderBottomColor: theme.border }}
              />
              {childYear.length === 4 && (
                <Pressable onPress={addChild}>
                  <Text className="text-xs font-bold" style={{ color: theme.primary }}>
                    Add
                  </Text>
                </Pressable>
              )}
            </View>
          </LifeRow>
        </Card>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mt-6"
          disabled={!canSave}
          loading={saving}
          onPress={() => void handleSave()}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </View>
    </ScrollView>
  );
}
