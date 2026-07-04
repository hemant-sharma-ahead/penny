import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, PageHeader, Banner } from '@/components/ui';
import { profileRepo } from '@/core/db/repositories';
import { logActivity } from '@/core/db/activityLog';
import { reseedForEmployment } from '@/core/db/seedDemoData';
import type { EmploymentType, GoalRisk, Profile } from '@/core/db/types';
import { EMPLOYMENT_OPTIONS } from '@/core/profile/employment';
import { isValidUsername } from '@/core/profile/username';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { deriveAge, deriveAgeBand } from '@/lib/date';
import { fileToReceiptDataUrl } from '@/lib/image';
import { checkUsername, claimAccount, UsernameTakenError } from '@/core/identity/claim';
import { useProfile } from '@/hooks/useProfile';

export function ProfilePage() {
  const navigate = useNavigate();
  const { profile, loading } = useProfile();

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Edit profile"
        leading={
          <Button
            variant="ghost"
            icon="ti-arrow-left"
            aria-label="Back"
            className="w-8 h-8 rounded-lg hover:text-primary"
            onClick={() => navigate(-1)}
          />
        }
      />
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#00a86b] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : profile ? (
        <ProfileEditor key={profile.id} profile={profile} />
      ) : (
        <p className="px-4 py-8 text-sm text-tertiary text-center">No profile found.</p>
      )}
    </div>
  );
}

/** A grouped card of in-field-label rows (label sits above the value, hairline-separated). */
function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-surface border border-theme px-4">{children}</div>;
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
  return (
    <div className="py-3 border-t border-theme first:border-t-0">
      <div className="flex items-center justify-between gap-2 min-h-[20px] mb-0.5">
        <span className="text-[11px] font-semibold text-tertiary">
          {label}
          {required && <span className="text-danger"> *</span>}
        </span>
        {trailing}
      </div>
      {children}
    </div>
  );
}

const flatInput =
  'w-full bg-transparent border-none p-0 text-[15px] text-primary focus:outline-none placeholder:text-tertiary';

/** A compact single-select pill group (tap the active one again to clear). */
function Pills({
  options,
  value,
  onChange
}: {
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="flex-1 py-2 rounded-xl text-xs font-bold border transition-colors"
            style={
              on
                ? { backgroundColor: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-tertiary mt-5 mb-2">{children}</p>;
}

function ProfileEditor({ profile }: { profile: Profile }) {
  const syncOn = hasEntitlement('sync');

  const [avatarDataUrl, setAvatarDataUrl] = useState(profile.avatarDataUrl ?? '');
  const [fullName, setFullName] = useState(profile.displayName ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [dob, setDob] = useState(profile.dob ?? '');
  const [employmentType, setEmploymentType] = useState<EmploymentType | undefined>(profile.employmentType);
  // Life & household (opt-in) — powers personalized life-stage goals.
  const [maritalStatus, setMaritalStatus] = useState<'single' | 'married' | undefined>(profile.maritalStatus);
  const [children, setChildren] = useState<number[]>(profile.children ?? []);
  const [homeOwner, setHomeOwner] = useState<boolean | undefined>(profile.homeOwner);
  const [riskAppetite, setRiskAppetite] = useState<GoalRisk | undefined>(profile.riskAppetite);
  const [childYear, setChildYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reseeded, setReseeded] = useState(false);

  // Claim / handle state (only meaningful when sync is entitled).
  const [claimed, setClaimed] = useState(Boolean(profile.deviceId));
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleDraft, setHandleDraft] = useState('');
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [handleBusy, setHandleBusy] = useState(false);
  const [handleError, setHandleError] = useState<string | undefined>();

  const fileRef = useRef<HTMLInputElement>(null);

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

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const url = await fileToReceiptDataUrl(file, 256, 0.8);
      setAvatarDataUrl(url);
      setSaved(false);
    } catch {
      /* ignore unreadable image */
    }
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
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
    setSaving(false);
    setSaved(true);
    setReseeded(didReseed);
  }

  // Claim a fresh account with the entered username (sync-entitled + not yet claimed).
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

  // Debounced availability check while changing an existing handle. (Availability resets to 'idle' in
  // the input's onChange; this effect only runs the network check for a valid, changed draft.)
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

  return (
    <div className="px-4 py-4 flex flex-col">
      {saved && (
        <Banner variant="success">
          Profile saved.{reseeded ? ' Sample data refreshed to match your new profile.' : ''}
        </Banner>
      )}

      {/* Identity hero */}
      <div className="flex items-center gap-4 py-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative flex-shrink-0"
          aria-label="Change profile photo"
        >
          <span
            className="w-16 h-16 rounded-full grid place-items-center text-white text-2xl font-bold overflow-hidden"
            style={{ background: 'linear-gradient(135deg, var(--color-primary), #00c47e)' }}
          >
            {avatarDataUrl ? <img src={avatarDataUrl} alt="" className="w-full h-full object-cover" /> : initial}
          </span>
          <span className="absolute -right-0.5 -bottom-0.5 w-6 h-6 rounded-full bg-surface border border-theme grid place-items-center">
            <i className="ti ti-camera text-secondary" style={{ fontSize: 12 }} aria-hidden="true" />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPickPhoto(e)} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-primary truncate">{fullName.trim() || 'Your account'}</p>
          {heroHandle && <p className="text-xs text-secondary truncate">{heroHandle}</p>}
          {syncOn && (
            <span
              className="inline-flex items-center gap-1 text-[10.5px] font-bold rounded-full px-2 py-0.5 mt-1.5"
              style={
                claimed
                  ? {
                      color: 'var(--color-success)',
                      backgroundColor: 'color-mix(in srgb, var(--color-success) 10%, transparent)'
                    }
                  : { color: 'var(--color-text-tertiary)', backgroundColor: 'var(--color-surface-secondary)' }
              }
            >
              <i className={`ti ${claimed ? 'ti-circle-check' : 'ti-circle-dashed'}`} aria-hidden="true" />
              {claimed ? 'Claimed on this device' : 'Not claimed yet'}
            </span>
          )}
        </div>
      </div>

      {/* Your details */}
      <SectionLabel>Your details</SectionLabel>
      <Card>
        <Field label="Full name" required>
          <input
            className={flatInput}
            value={fullName}
            onChange={(e) => edited(setFullName)(e.target.value)}
            placeholder="Your name"
          />
        </Field>
        <Field
          label="Date of birth"
          trailing={
            ageBand ? (
              <span
                className="text-[10.5px] font-bold rounded-full px-2 py-0.5"
                style={{
                  color: 'var(--color-primary)',
                  backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, transparent)'
                }}
              >
                age band {ageBand}
              </span>
            ) : undefined
          }
        >
          <input className={flatInput} type="date" value={dob} onChange={(e) => edited(setDob)(e.target.value)} />
        </Field>
      </Card>
      {dob && !dobValid && <p className="text-[11px] text-danger mt-1.5 px-1">Enter a valid date of birth.</p>}
      <p className="text-[11px] text-tertiary mt-1.5 px-1">
        Personalises FIRE, retirement &amp; tax context. Only a 5-year age band is shared with Chip.
      </p>

      {/* Sharing / account */}
      <SectionLabel>{syncOn ? 'Sharing & account' : 'Sharing'}</SectionLabel>
      <Card>
        {syncOn && claimed && !editingHandle ? (
          <Field
            label="Username"
            trailing={
              <button
                type="button"
                onClick={() => {
                  setEditingHandle(true);
                  setHandleDraft(username);
                  setHandleError(undefined);
                }}
                className="text-xs font-bold inline-flex items-center gap-1"
                style={{ color: 'var(--color-primary)' }}
              >
                <i className="ti ti-pencil" aria-hidden="true" /> Change
              </button>
            }
          >
            <span className="text-[15px] font-semibold text-primary">@{username}</span>
          </Field>
        ) : syncOn && claimed && editingHandle ? (
          <Field
            label="New username"
            trailing={
              availability === 'checking' ? (
                <span className="text-[10.5px] text-tertiary">Checking…</span>
              ) : availability === 'available' ? (
                <span className="text-[10.5px] font-bold text-success">
                  <i className="ti ti-check" aria-hidden="true" /> Available
                </span>
              ) : availability === 'taken' ? (
                <span className="text-[10.5px] font-bold text-danger">Taken</span>
              ) : undefined
            }
          >
            <input
              className={flatInput}
              value={handleDraft}
              autoFocus
              onChange={(e) => {
                setHandleDraft(e.target.value.toLowerCase());
                setAvailability('idle');
              }}
              placeholder="new_handle"
            />
          </Field>
        ) : (
          <Field
            label={syncOn ? 'Username (optional)' : 'Username (optional)'}
            trailing={
              syncOn && !claimed ? (
                <button
                  type="button"
                  onClick={() => void handleClaim()}
                  disabled={handleBusy || !isValidUsername(username)}
                  className="text-[11px] font-extrabold text-white rounded-full px-3 py-1 inline-flex items-center gap-1 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--color-primary)' }}
                >
                  <i className="ti ti-shield-check" aria-hidden="true" /> {handleBusy ? 'Claiming…' : 'Claim'}
                </button>
              ) : undefined
            }
          >
            <input
              className={flatInput}
              value={username}
              onChange={(e) => edited((v: string) => setUsername(v.toLowerCase()))(e.target.value)}
              placeholder="e.g. aarav_s"
            />
          </Field>
        )}
      </Card>
      {editingHandle && (
        <div className="flex gap-2 mt-2">
          <Button variant="secondary" className="flex-1" onClick={() => setEditingHandle(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            disabled={availability !== 'available' || handleBusy}
            onClick={() => void handleUpdateHandle()}
          >
            {handleBusy ? 'Updating…' : 'Update handle'}
          </Button>
        </div>
      )}
      {handleError && <p className="text-[11px] text-danger mt-1.5 px-1">{handleError}</p>}
      {!usernameValid && !editingHandle && (
        <p className="text-[11px] text-danger mt-1.5 px-1">3–20 lowercase letters, numbers, or _.</p>
      )}
      <p className="text-[11px] text-tertiary mt-1.5 px-1">
        {syncOn
          ? 'Your public handle for household sharing. It can never decrypt your data.'
          : 'A provisional handle — confirmed on the server when you enable sharing later.'}
      </p>

      {/* Employment */}
      <SectionLabel>Employment</SectionLabel>
      <div className="grid grid-cols-5 gap-2.5">
        {EMPLOYMENT_OPTIONS.map((o) => {
          const on = employmentType === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setSaved(false);
                setEmploymentType(o.value);
              }}
              aria-pressed={on}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className="w-12 h-12 rounded-2xl grid place-items-center border transition-colors"
                style={
                  on
                    ? { backgroundColor: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                    : {
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text-tertiary)',
                        borderColor: 'var(--color-border)'
                      }
                }
              >
                <i className={`ti ${o.icon}`} style={{ fontSize: 20 }} aria-hidden="true" />
              </span>
              <span
                className={`text-[9px] font-medium text-center leading-tight ${on ? 'text-secondary' : 'text-tertiary'}`}
              >
                {o.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-tertiary mt-2 px-1">Affects EPF visibility, tax notes &amp; health benchmarks.</p>

      {/* Life & household — opt-in; unlocks personalized life-stage goals & guidance */}
      <SectionLabel>Life &amp; household</SectionLabel>
      <Card>
        <div className="py-3">
          <p className="text-[11px] text-tertiary leading-relaxed">
            Optional — add these to unlock <b className="text-secondary">personalized goals</b> (a child's education
            corpus, the right cover, a retirement target). Stored encrypted on your device; only a 5-year age band ever
            reaches Chip.
          </p>
        </div>
        <Field label="Relationship">
          <Pills
            options={[
              { value: 'single', label: 'Single' },
              { value: 'married', label: 'Married' }
            ]}
            value={maritalStatus}
            onChange={(v) => {
              setSaved(false);
              setMaritalStatus(maritalStatus === v ? undefined : (v as 'single' | 'married'));
            }}
          />
        </Field>
        <Field label="Home">
          <Pills
            options={[
              { value: 'own', label: 'Own' },
              { value: 'rent', label: 'Rent' }
            ]}
            value={homeOwner === undefined ? undefined : homeOwner ? 'own' : 'rent'}
            onChange={(v) => {
              setSaved(false);
              const next = v === 'own';
              setHomeOwner(homeOwner === next ? undefined : next);
            }}
          />
        </Field>
        <Field label="Risk appetite">
          <Pills
            options={[
              { value: 'conservative', label: 'Conservative' },
              { value: 'moderate', label: 'Moderate' },
              { value: 'aggressive', label: 'Aggressive' }
            ]}
            value={riskAppetite}
            onChange={(v) => {
              setSaved(false);
              setRiskAppetite(riskAppetite === v ? undefined : (v as GoalRisk));
            }}
          />
        </Field>
        <Field label="Children (birth years)">
          <div className="flex flex-wrap items-center gap-1.5">
            {children.map((yr, i) => (
              <span
                key={`${yr}-${i}`}
                className="inline-flex items-center gap-1 text-xs font-semibold rounded-full pl-2.5 pr-1.5 py-1"
                style={{ backgroundColor: 'var(--color-surface-secondary)', color: 'var(--color-text-secondary)' }}
              >
                {yr}
                <button
                  type="button"
                  aria-label={`Remove ${yr}`}
                  onClick={() => {
                    setSaved(false);
                    setChildren(children.filter((_, idx) => idx !== i));
                  }}
                  className="text-tertiary hover:text-danger"
                >
                  <i className="ti ti-x" style={{ fontSize: 13 }} aria-hidden="true" />
                </button>
              </span>
            ))}
            <input
              value={childYear}
              onChange={(e) => setChildYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addChild();
                }
              }}
              inputMode="numeric"
              placeholder="e.g. 2018"
              className="w-20 bg-transparent border-b border-theme text-sm text-primary focus:outline-none placeholder:text-tertiary py-0.5"
            />
            {childYear.length === 4 && (
              <button
                type="button"
                onClick={addChild}
                className="text-xs font-bold"
                style={{ color: 'var(--color-primary)' }}
              >
                Add
              </button>
            )}
          </div>
        </Field>
      </Card>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        className="mt-6"
        disabled={!canSave}
        loading={saving}
        onClick={() => void handleSave()}
      >
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
    </div>
  );
}
