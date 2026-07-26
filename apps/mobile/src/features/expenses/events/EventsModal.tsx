import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { epochToDateInput } from '@/lib/formatters';
import { daysBetween } from '@/lib/date';
import { Modal, Button, TextInput, DateInput, Card, Banner } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useEventMode, EVENT_COLORS, toEventHashtag, normalizeHashtag } from '~/context/EventModeContext';
import type { ActiveEvent, EventSubtype } from '~/context/EventModeContext';
import { useGroupContext } from '~/context/GroupContext';
import { useToast } from '~/context/ToastContext';
import { hasEntitlement } from '@/core/entitlement/entitlement';
import { createGroup } from '@/core/groups/groupsService';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';

interface EventsModalProps {
  onClose: () => void;
  linkedCountByEventHashtag: Map<string, number>;
  nowMs: number;
  onRequestEditSave: (
    event: ActiveEvent,
    edits: { name: string; color: string; startDate: string; endDate: string }
  ) => void;
}

const EVENT_TYPES: EventSubtype[] = ['background', 'immersive'];

export function EventsModal({ onClose, linkedCountByEventHashtag, nowMs, onRequestEditSave }: EventsModalProps) {
  const theme = useThemeColors();
  const { events, pastEvents, addEvent, stopEvent, reactivateEvent, demoteEvent } = useEventMode();

  const [showNewEventForm, setShowNewEventForm] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventType, setNewEventType] = useState<EventSubtype>('background');
  const [newEventStartDate, setNewEventStartDate] = useState(() => epochToDateInput(nowMs));
  const [newEventEndDate, setNewEventEndDate] = useState('');
  const [newEventColor, setNewEventColor] = useState(EVENT_COLORS[0] ?? '#ef4444');
  const [vacationBlockError, setVacationBlockError] = useState(false);

  const [editingEvent, setEditingEvent] = useState<ActiveEvent | null>(null);
  const [editEventName, setEditEventName] = useState('');
  const [editEventColor, setEditEventColor] = useState(EVENT_COLORS[0] ?? '#ef4444');
  const [editEventStartDate, setEditEventStartDate] = useState('');
  const [editEventEndDate, setEditEventEndDate] = useState('');

  const [reactivatingEvent, setReactivatingEvent] = useState<ActiveEvent | null>(null);
  const [reactivateEndDate, setReactivateEndDate] = useState('');

  function handleCreateEvent() {
    const name = newEventName.trim();
    if (!name) return;
    if (newEventType === 'immersive' && events.some((e) => e.subtype === 'immersive')) {
      setVacationBlockError(true);
      return;
    }
    setVacationBlockError(false);
    addEvent({
      name,
      subtype: newEventType,
      hashtag: toEventHashtag(name),
      startDate: new Date(newEventStartDate).getTime(),
      ...(newEventType === 'immersive' && newEventEndDate
        ? { endDate: new Date(newEventEndDate + 'T23:59:59').getTime() }
        : {}),
      autoTag: newEventType === 'immersive',
      color: newEventColor
    });
    setNewEventName('');
    setNewEventType('background');
    setNewEventStartDate(epochToDateInput(nowMs));
    setNewEventEndDate('');
    setNewEventColor(EVENT_COLORS[0] ?? '#ef4444');
    setShowNewEventForm(false);
  }

  function handleEditSaveClick(ev: ActiveEvent) {
    if (!editEventName.trim()) return;
    setEditingEvent(null);
    onRequestEditSave(ev, {
      name: editEventName,
      color: editEventColor,
      startDate: editEventStartDate,
      endDate: editEventEndDate
    });
  }

  return (
    <Modal onClose={onClose} title="Events" scrollable>
      {showNewEventForm ? (
        <View className="gap-3 bg-surface-2 rounded-xl p-4">
          <View>
            <TextInput
              label="Event name"
              placeholder="e.g. Goa Trip, Home Renovation"
              value={newEventName}
              onChange={setNewEventName}
              autoFocus
            />
            {newEventName.trim().length > 0 && (
              <Text className="text-[10px] mt-1 text-tertiary">
                Hashtag: <Text style={{ color: theme.primary }}>#{toEventHashtag(newEventName)}</Text>
              </Text>
            )}
          </View>

          <View>
            <Text className="text-xs font-medium text-secondary">Type</Text>
            <View className="mt-1 flex-row flex-wrap gap-2">
              {EVENT_TYPES.map((t) => {
                const active = newEventType === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => {
                      setNewEventType(t);
                      setVacationBlockError(false);
                    }}
                    className="flex-1 py-2.5 rounded-xl border-2 items-center"
                    style={{
                      borderColor: active ? theme.primary : theme.border,
                      backgroundColor: active ? theme.surface : undefined
                    }}
                  >
                    <Text
                      className="text-xs font-medium"
                      style={{ color: active ? theme.primary : theme.textSecondary }}
                    >
                      {t === 'background' ? '🗓 Event' : '✈ Vacation'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {vacationBlockError ? (
              <Text className="text-[10px] mt-1.5 text-danger">
                A vacation is already active. Stop it before starting a new one.
              </Text>
            ) : (
              <Text className="text-[10px] mt-1.5 text-tertiary">
                {newEventType === 'background'
                  ? 'Open-ended. Tap the hashtag chip in the expense form to associate expenses.'
                  : 'Fixed dates. Every expense is auto-tagged while the vacation is active.'}
              </Text>
            )}
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <DateInput
                label="Start date"
                value={newEventStartDate}
                onChange={(val) => {
                  setNewEventStartDate(val);
                  if (newEventEndDate && newEventEndDate < val) setNewEventEndDate(val);
                }}
              />
            </View>
            <View className="flex-1">
              <DateInput
                label="End date"
                value={newEventEndDate}
                disabled={newEventType === 'background'}
                onChange={setNewEventEndDate}
              />
            </View>
          </View>

          <View>
            <Text className="text-xs font-medium text-secondary">Colour</Text>
            <View className="mt-1.5 flex-row flex-wrap gap-2">
              {EVENT_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setNewEventColor(c)}
                  className="w-7 h-7 rounded-full border-2"
                  style={{
                    backgroundColor: c,
                    borderColor: newEventColor === c ? theme.textPrimary : 'transparent',
                    transform: newEventColor === c ? [{ scale: 1.2 }] : [{ scale: 1 }]
                  }}
                  accessibilityLabel={`Select colour ${c}`}
                />
              ))}
            </View>
          </View>

          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                variant="secondary"
                fullWidth
                onPress={() => {
                  setShowNewEventForm(false);
                  setNewEventName('');
                  setVacationBlockError(false);
                }}
              >
                Cancel
              </Button>
            </View>
            <View className="flex-1">
              <Button
                variant="primary"
                fullWidth
                disabled={!newEventName.trim() || (newEventType === 'immersive' && !newEventEndDate)}
                onPress={handleCreateEvent}
              >
                Start event
              </Button>
            </View>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setShowNewEventForm(true)}
          className="w-full py-3 rounded-xl border-2 border-dashed items-center"
          style={{ borderColor: theme.borderStrong }}
        >
          <Text className="text-sm font-medium text-secondary">+ New event</Text>
        </Pressable>
      )}

      {events.length > 0 && (
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-tertiary">Active</Text>
          {events.map((ev) =>
            editingEvent?.id === ev.id ? (
              <View key={ev.id} className="gap-3 bg-surface-2 rounded-xl p-4">
                <View>
                  <TextInput label="Event name" value={editEventName} onChange={setEditEventName} autoFocus />
                </View>
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <DateInput
                      label="Start date"
                      value={editEventStartDate}
                      onChange={(val) => {
                        setEditEventStartDate(val);
                        if (editEventEndDate && editEventEndDate < val) setEditEventEndDate(val);
                      }}
                    />
                  </View>
                  <View className="flex-1">
                    <DateInput
                      label="End date"
                      value={editEventEndDate}
                      disabled={ev.subtype === 'background'}
                      onChange={setEditEventEndDate}
                    />
                  </View>
                </View>
                <View>
                  <Text className="text-xs font-medium text-secondary">Colour</Text>
                  <View className="mt-1.5 flex-row flex-wrap gap-2">
                    {EVENT_COLORS.map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => setEditEventColor(c)}
                        className="w-7 h-7 rounded-full border-2"
                        style={{
                          backgroundColor: c,
                          borderColor: editEventColor === c ? theme.textPrimary : 'transparent',
                          transform: editEventColor === c ? [{ scale: 1.2 }] : [{ scale: 1 }]
                        }}
                        accessibilityLabel={`Select colour ${c}`}
                      />
                    ))}
                  </View>
                </View>
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Button variant="secondary" fullWidth onPress={() => setEditingEvent(null)}>
                      Cancel
                    </Button>
                  </View>
                  <View className="flex-1">
                    <Button
                      variant="primary"
                      fullWidth
                      disabled={!editEventName.trim() || (ev.subtype === 'immersive' && !editEventEndDate)}
                      onPress={() => handleEditSaveClick(ev)}
                    >
                      Save
                    </Button>
                  </View>
                </View>
              </View>
            ) : (
              <View key={ev.id} className="gap-1.5">
                <Card padding="xs" radius="md" className="flex-row items-center gap-3">
                  <View className="w-3 h-3 rounded-full" style={{ backgroundColor: ev.color }} />
                  <View className="flex-1 shrink">
                    <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                      {ev.name}
                    </Text>
                    <Text className="text-[10px] text-tertiary">
                      #{ev.hashtag} · {ev.subtype === 'immersive' ? 'Vacation' : 'Event'} ·{' '}
                      {ev.endDate ? `ends ${new Date(ev.endDate).toLocaleDateString('en-IN')}` : 'Ongoing'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setEditingEvent(ev);
                      setEditEventName(ev.name);
                      setEditEventColor(ev.color);
                      setEditEventStartDate(epochToDateInput(ev.startDate));
                      setEditEventEndDate(ev.endDate ? epochToDateInput(ev.endDate) : '');
                    }}
                    className="rounded-lg border px-2.5 py-1"
                    style={{ borderColor: theme.border }}
                  >
                    <Text className="text-xs text-secondary">Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => stopEvent(ev.id)}
                    className="rounded-lg border px-2.5 py-1"
                    style={{ borderColor: tint(theme.danger, 30) }}
                  >
                    <Text className="text-xs text-danger">Stop</Text>
                  </Pressable>
                </Card>
                {ev.subtype === 'immersive' && <VacationGroupLink ev={ev} />}
              </View>
            )
          )}
        </View>
      )}

      {pastEvents.length > 0 && (
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase tracking-wide text-tertiary">Tracked</Text>
          {pastEvents.map((ev) => {
            const linkedCount = linkedCountByEventHashtag.get(normalizeHashtag(ev.hashtag)) ?? 0;
            const endDatePast = ev.endDate !== undefined && ev.endDate < nowMs;
            const durationDays = ev.endDate !== undefined ? Math.max(1, daysBetween(ev.startDate, ev.endDate)) : null;
            const sameDay =
              ev.endDate !== undefined && new Date(ev.startDate).toDateString() === new Date(ev.endDate).toDateString();
            const fmtShort = (ms: number) =>
              new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            const fmtFull = (ms: number) =>
              new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            const trackedDateLabel = ev.endDate
              ? sameDay
                ? `${fmtFull(ev.startDate)} · 1 day`
                : `${fmtShort(ev.startDate)} – ${fmtFull(ev.endDate)} · ${durationDays} day${durationDays !== 1 ? 's' : ''}`
              : fmtFull(ev.startDate);

            const cardHeader = (
              <View className="flex-row items-start gap-3 p-3">
                <View className="w-3 h-3 rounded-full mt-0.5" style={{ backgroundColor: ev.color }} />
                <View className="flex-1 shrink">
                  <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                    {ev.name}
                  </Text>
                  <Text className="text-[10px] text-tertiary mt-0.5" numberOfLines={1}>
                    #{ev.hashtag}
                  </Text>
                  <Text className="text-[10px] text-tertiary" numberOfLines={1}>
                    {trackedDateLabel}
                  </Text>
                </View>
              </View>
            );

            if (reactivatingEvent?.id === ev.id) {
              const isVacation = ev.subtype === 'immersive';
              return (
                <View key={ev.id} className="bg-surface border border-theme rounded-xl overflow-hidden">
                  {cardHeader}
                  <View className="mx-3 border-t border-theme" />
                  <View className="gap-3 p-3">
                    <Banner variant="warning">
                      {isVacation
                        ? 'End date has passed. Set a new end date to reactivate.'
                        : 'End date has passed. Reactivating will clear it so the event continues ongoing.'}
                    </Banner>
                    {isVacation && (
                      <View>
                        <DateInput label="New end date" value={reactivateEndDate} onChange={setReactivateEndDate} />
                      </View>
                    )}
                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Button
                          variant="secondary"
                          fullWidth
                          onPress={() => {
                            setReactivatingEvent(null);
                            setReactivateEndDate('');
                          }}
                        >
                          Cancel
                        </Button>
                      </View>
                      <View className="flex-1">
                        <Button
                          variant="primary"
                          fullWidth
                          disabled={isVacation && !reactivateEndDate}
                          onPress={() => {
                            if (isVacation) {
                              if (!reactivateEndDate) return;
                              const newEndMs = new Date(reactivateEndDate + 'T23:59:59').getTime();
                              reactivateEvent(ev.id, { endDate: newEndMs });
                            } else {
                              reactivateEvent(ev.id);
                            }
                            setReactivatingEvent(null);
                            setReactivateEndDate('');
                          }}
                        >
                          Reactivate
                        </Button>
                      </View>
                    </View>
                  </View>
                </View>
              );
            }

            return (
              <View key={ev.id} className="bg-surface border border-theme rounded-xl">
                <View className="flex-row items-start gap-3 p-3">
                  <View className="w-3 h-3 rounded-full mt-0.5" style={{ backgroundColor: ev.color }} />
                  <View className="flex-1 shrink">
                    <Text className="text-sm font-medium text-primary" numberOfLines={1}>
                      {ev.name}
                    </Text>
                    <Text className="text-[10px] text-tertiary mt-0.5" numberOfLines={1}>
                      #{ev.hashtag}
                    </Text>
                    <Text className="text-[10px] text-tertiary" numberOfLines={1}>
                      {trackedDateLabel}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Pressable
                      onPress={() => {
                        if (endDatePast) {
                          setReactivatingEvent(ev);
                          setReactivateEndDate(ev.endDate ? epochToDateInput(ev.endDate) : '');
                        } else {
                          reactivateEvent(ev.id);
                        }
                      }}
                      className="rounded-lg border px-2.5 py-1"
                      style={{ borderColor: theme.border }}
                    >
                      <Text className="text-xs text-secondary">Reactivate</Text>
                    </Pressable>
                    {linkedCount > 0 ? (
                      <View className="rounded-lg border px-2 py-1" style={{ borderColor: theme.border }}>
                        <Text className="text-[10px] text-tertiary">{linkedCount} linked</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => demoteEvent(ev.id)}
                        className="rounded-lg border px-2.5 py-1"
                        style={{ borderColor: theme.border }}
                      >
                        <Text className="text-xs text-tertiary">Remove</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Modal>
  );
}

/**
 * RN port of web's `VacationGroupLink` sub-component (Track E, screens 10–11). For an active vacation,
 * offer to create a group named after the trip or link an existing one. While linked, the Add flow
 * defaults new expenses to split with that group (see `ExpenseForm`), and trip spend stays out of
 * category analytics via the event hashtag. Only shown when Groups are usable (sync-entitled + claimed
 * account).
 */
function VacationGroupLink({ ev }: { ev: ActiveEvent }) {
  const theme = useThemeColors();
  const { updateEvent } = useEventMode();
  const { groups, claimed, refresh } = useGroupContext();
  const { showToast } = useToast();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!hasEntitlement('sync') || !claimed) return null;

  const linked = ev.linkedGroupId ? groups.find((g) => g.id === ev.linkedGroupId) : undefined;
  const linkableGroups = groups.filter((g) => g.status === 'active');

  // Already linked → show the link + an unlink affordance.
  if (ev.linkedGroupId) {
    return (
      <View
        className="flex-row items-center gap-2 rounded-lg px-3 py-2"
        style={{ backgroundColor: tint(theme.primary, 8) }}
      >
        <Icon name="ti-link" size={14} color={theme.primary} />
        <Text className="text-xs text-secondary flex-1">
          Splitting with <Text className="text-primary font-bold">{linked?.name ?? 'group'}</Text>
        </Text>
        <Pressable onPress={() => updateEvent(ev.id, { linkedGroupId: undefined })}>
          <Text className="text-xs text-tertiary">Unlink</Text>
        </Pressable>
      </View>
    );
  }

  if (!picking) {
    return (
      <Pressable
        onPress={() => setPicking(true)}
        className="flex-row items-center gap-2 rounded-lg border border-dashed px-3 py-2"
        style={{ borderColor: theme.border }}
      >
        <Icon name="ti-users-group" size={14} color={theme.textSecondary} />
        <Text className="text-xs text-secondary">Link a group — split trip costs with companions</Text>
      </Pressable>
    );
  }

  async function createAndLink() {
    setBusy(true);
    try {
      const g = await createGroup({ name: ev.name, type: 'trip', historyVisibility: 'full' });
      refresh();
      updateEvent(ev.id, { linkedGroupId: g.id });
      showToast({ message: `Linked to ${g.name}` });
      setPicking(false);
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Could not create the group' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-2 rounded-lg bg-surface-2 p-3">
      <Pressable
        onPress={() => void createAndLink()}
        disabled={busy}
        className="flex-row items-center gap-2"
        style={{ opacity: busy ? 0.5 : 1 }}
      >
        <Icon name="ti-plus" size={14} color={theme.primary} />
        <Text className="text-xs font-medium" style={{ color: theme.primary }}>
          Create &quot;{ev.name}&quot; group
        </Text>
      </Pressable>
      {linkableGroups.length > 0 && (
        <>
          <Text className="text-[10px] text-tertiary">Or link an existing group</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {linkableGroups.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => {
                  updateEvent(ev.id, { linkedGroupId: g.id });
                  setPicking(false);
                }}
                className="rounded-lg border px-2.5 py-1"
                style={{ borderColor: theme.border }}
              >
                <Text className="text-xs text-secondary">{g.name}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <Pressable onPress={() => setPicking(false)}>
        <Text className="text-[11px] text-tertiary">Cancel</Text>
      </Pressable>
    </View>
  );
}
