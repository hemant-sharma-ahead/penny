import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, PageHeader, TextInput, OptionButton, Banner } from '@/components/ui';
import { profileRepo } from '@/core/db/repositories';
import { logActivity } from '@/core/db/activityLog';
import { reseedForEmployment } from '@/core/db/seedDemoData';
import type { EmploymentType, Profile } from '@/core/db/types';
import { EMPLOYMENT_OPTIONS } from '@/core/profile/employment';
import { isValidUsername } from '@/core/profile/username';
import { deriveAge } from '@/lib/date';
import { useProfile } from '@/hooks/useProfile';

export function ProfilePage() {
  const navigate = useNavigate();
  const { profile, loading } = useProfile();

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Profile"
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

function ProfileEditor({ profile }: { profile: Profile }) {
  const [fullName, setFullName] = useState(profile.displayName ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [dob, setDob] = useState(profile.dob ?? '');
  const [employmentType, setEmploymentType] = useState<EmploymentType | undefined>(profile.employmentType);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reseeded, setReseeded] = useState(false);

  const age = dob ? deriveAge(dob) : null;
  const dobValid = dob === '' || (age !== null && age >= 13 && age <= 120);
  const usernameValid = username === '' || isValidUsername(username);
  const canSave = fullName.trim().length > 0 && dobValid && usernameValid && !saving;

  function edited<T>(setter: (v: T) => void) {
    return (v: T) => {
      setSaved(false);
      setter(v);
    };
  }

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const employmentChanged = employmentType !== profile.employmentType;
    await profileRepo.put({
      ...profile,
      displayName: fullName.trim(),
      username: username.trim() || undefined,
      dob: dob || undefined,
      employmentType,
      updatedAt: Date.now()
    });
    logActivity({ action: 'UPDATE', entityType: 'profile', entityId: profile.id, summary: 'Updated profile' });
    // Refresh the sample data to match the new employment type — but only while
    // it's still demo data the user hasn't built on (reseedForEmployment bails otherwise).
    const didReseed = employmentChanged && employmentType ? await reseedForEmployment(employmentType) : false;
    setSaving(false);
    setSaved(true);
    setReseeded(didReseed);
  }

  return (
    <div className="px-4 py-4 flex flex-col gap-4">
      {saved && (
        <Banner variant="success">
          Profile saved.{reseeded ? ' Sample data refreshed to match your new profile.' : ''}
        </Banner>
      )}

      <TextInput label="Full name" required value={fullName} onChange={edited(setFullName)} placeholder="Your name" />

      <TextInput
        label="Username (optional)"
        value={username}
        onChange={edited((v: string) => setUsername(v.toLowerCase()))}
        placeholder="e.g. aarav_s"
        error={!usernameValid ? '3–20 lowercase letters, numbers, or _' : undefined}
        hint="Used for household sharing later — confirmed on the server when you set that up."
      />

      <TextInput
        label="Date of birth"
        type="date"
        value={dob}
        onChange={edited(setDob)}
        error={dob && !dobValid ? 'Enter a valid date of birth' : undefined}
        hint="Personalises FIRE, retirement, and tax context. Only a 5-year age band is shared with Chip."
      />

      <div>
        <p className="text-sm font-medium text-secondary mb-1.5">Employment</p>
        <div className="grid grid-cols-2 gap-2">
          {EMPLOYMENT_OPTIONS.map((o) => (
            <OptionButton
              key={o.value}
              label={o.label}
              icon={o.icon}
              compact
              selected={employmentType === o.value}
              onClick={() => {
                setSaved(false);
                setEmploymentType(o.value);
              }}
            />
          ))}
        </div>
        <p className="text-[11px] text-tertiary mt-1.5">Affects EPF visibility, tax notes, and health benchmarks.</p>
      </div>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!canSave}
        loading={saving}
        onClick={() => void handleSave()}
      >
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
    </div>
  );
}
