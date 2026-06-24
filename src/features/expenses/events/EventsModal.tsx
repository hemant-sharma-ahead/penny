import { useState } from 'react';
import { Modal, Button, TextInput, Card } from '@/components/ui';
import { useEventMode, EVENT_COLORS, toEventHashtag, normalizeHashtag } from '@/context/EventModeContext';
import type { ActiveEvent, EventSubtype } from '@/context/EventModeContext';
import { epochToDateInput } from '@/lib/formatters';

interface EventsModalProps {
  onClose: () => void;
  linkedCountByEventHashtag: Map<string, number>;
  nowMs: number;
  onRequestEditSave: (
    event: ActiveEvent,
    edits: { name: string; color: string; startDate: string; endDate: string }
  ) => void;
}

export function EventsModal({ onClose, linkedCountByEventHashtag, nowMs, onRequestEditSave }: EventsModalProps) {
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
      {/* New event toggle / form */}
      {showNewEventForm ? (
        <div className="flex flex-col gap-3 bg-surface-2 rounded-xl p-4">
          <div>
            <TextInput
              label="Event name"
              placeholder="e.g. Goa Trip, Home Renovation"
              value={newEventName}
              onChange={(val) => setNewEventName(val)}
              autoFocus
            />
            {newEventName.trim() && (
              <p className="text-[10px] mt-1 text-tertiary">
                Hashtag: <span style={{ color: 'var(--color-primary)' }}>#{toEventHashtag(newEventName)}</span>
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-secondary">Type</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(['background', 'immersive'] as EventSubtype[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setNewEventType(t);
                    setVacationBlockError(false);
                  }}
                  className="py-2.5 rounded-xl border-2 text-xs font-medium transition-colors"
                  style={
                    newEventType === t
                      ? {
                          borderColor: 'var(--color-primary)',
                          color: 'var(--color-primary)',
                          backgroundColor: 'var(--color-surface)'
                        }
                      : { borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }
                  }
                >
                  {t === 'background' ? '🗓 Event' : '✈ Vacation'}
                </button>
              ))}
            </div>
            {vacationBlockError ? (
              <p className="text-[10px] mt-1.5 text-red-500">
                A vacation is already active. Stop it before starting a new one.
              </p>
            ) : (
              <p className="text-[10px] mt-1.5 text-tertiary">
                {newEventType === 'background'
                  ? 'Open-ended. Tap the hashtag chip in the expense form to associate expenses.'
                  : 'Fixed dates. Every expense is auto-tagged while the vacation is active.'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <TextInput
                label="Start date"
                type="date"
                value={newEventStartDate}
                onChange={(val) => {
                  setNewEventStartDate(val);
                  if (newEventEndDate && newEventEndDate < val) setNewEventEndDate(val);
                }}
              />
            </div>
            <div>
              <TextInput
                label="End date"
                type="date"
                value={newEventEndDate}
                disabled={newEventType === 'background'}
                onChange={(val) => setNewEventEndDate(val)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-secondary">Colour</label>
            <div className="mt-1.5 flex gap-2">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewEventColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: newEventColor === c ? 'var(--color-text-primary)' : 'transparent',
                    transform: newEventColor === c ? 'scale(1.2)' : 'scale(1)'
                  }}
                  aria-label={`Select colour ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                setShowNewEventForm(false);
                setNewEventName('');
                setVacationBlockError(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              fullWidth
              disabled={!newEventName.trim() || (newEventType === 'immersive' && !newEventEndDate)}
              onClick={handleCreateEvent}
            >
              Start event
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowNewEventForm(true)}
          className="w-full py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-colors text-secondary hover:text-primary"
          style={{ borderColor: 'var(--color-border-strong)' }}
        >
          + New event
        </button>
      )}

      {/* Active events */}
      {events.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Active</p>
          {events.map((ev) =>
            editingEvent?.id === ev.id ? (
              <div key={ev.id} className="flex flex-col gap-3 bg-surface-2 rounded-xl p-4">
                <div>
                  <TextInput
                    label="Event name"
                    value={editEventName}
                    onChange={(val) => setEditEventName(val)}
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <TextInput
                      label="Start date"
                      type="date"
                      value={editEventStartDate}
                      onChange={(val) => {
                        setEditEventStartDate(val);
                        if (editEventEndDate && editEventEndDate < val) setEditEventEndDate(val);
                      }}
                    />
                  </div>
                  <div>
                    <TextInput
                      label="End date"
                      type="date"
                      value={editEventEndDate}
                      disabled={ev.subtype === 'background'}
                      onChange={(val) => setEditEventEndDate(val)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary">Colour</label>
                  <div className="mt-1.5 flex gap-2">
                    {EVENT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditEventColor(c)}
                        className="w-7 h-7 rounded-full border-2 transition-all"
                        style={{
                          backgroundColor: c,
                          borderColor: editEventColor === c ? 'var(--color-text-primary)' : 'transparent',
                          transform: editEventColor === c ? 'scale(1.2)' : 'scale(1)'
                        }}
                        aria-label={`Select colour ${c}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" fullWidth onClick={() => setEditingEvent(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    fullWidth
                    disabled={!editEventName.trim() || (ev.subtype === 'immersive' && !editEventEndDate)}
                    onClick={() => handleEditSaveClick(ev)}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <Card key={ev.id} padding="xs" radius="md" className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary truncate">{ev.name}</p>
                  <p className="text-[10px] text-tertiary">
                    #{ev.hashtag} · {ev.subtype === 'immersive' ? 'Vacation' : 'Event'} ·{' '}
                    {ev.endDate ? `ends ${new Date(ev.endDate).toLocaleDateString('en-IN')}` : 'Ongoing'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingEvent(ev);
                    setEditEventName(ev.name);
                    setEditEventColor(ev.color);
                    setEditEventStartDate(epochToDateInput(ev.startDate));
                    setEditEventEndDate(ev.endDate ? epochToDateInput(ev.endDate) : '');
                  }}
                  className="text-xs text-secondary border border-theme rounded-lg px-2.5 py-1 flex-shrink-0"
                >
                  Edit
                </button>
                <button
                  onClick={() => stopEvent(ev.id)}
                  className="text-xs text-red-500 border border-red-200 rounded-lg px-2.5 py-1 flex-shrink-0"
                >
                  Stop
                </button>
              </Card>
            )
          )}
        </div>
      )}

      {/* Tracked (past) events */}
      {pastEvents.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Tracked</p>
          {pastEvents.map((ev) => {
            const linkedCount = linkedCountByEventHashtag.get(normalizeHashtag(ev.hashtag)) ?? 0;
            const endDatePast = ev.endDate !== undefined && ev.endDate < nowMs;
            const durationDays =
              ev.endDate !== undefined ? Math.max(1, Math.round((ev.endDate - ev.startDate) / 86_400_000)) : null;
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
              <div className="flex items-start gap-3 p-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: ev.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary truncate">{ev.name}</p>
                  <p className="text-[10px] text-tertiary mt-0.5 truncate">#{ev.hashtag}</p>
                  <p className="text-[10px] text-tertiary truncate">{trackedDateLabel}</p>
                </div>
              </div>
            );

            if (reactivatingEvent?.id === ev.id) {
              const isVacation = ev.subtype === 'immersive';
              return (
                <div key={ev.id} className="surface rounded-xl overflow-hidden">
                  {cardHeader}
                  <div className="h-px border-theme mx-3" style={{ borderTopWidth: 1 }} />
                  <div className="flex flex-col gap-3 p-3">
                    <div className="flex items-start gap-2 bg-amber-50 rounded-xl px-3 py-2.5">
                      <i
                        className="ti ti-alert-triangle text-amber-500 flex-shrink-0 mt-0.5"
                        style={{ fontSize: 14 }}
                        aria-hidden="true"
                      />
                      <p className="text-[11px] text-amber-700 leading-snug">
                        {isVacation
                          ? 'End date has passed. Set a new end date to reactivate.'
                          : 'End date has passed. Reactivating will clear it so the event continues ongoing.'}
                      </p>
                    </div>
                    {isVacation && (
                      <div>
                        <TextInput
                          label="New end date"
                          type="date"
                          value={reactivateEndDate}
                          onChange={(val) => setReactivateEndDate(val)}
                          autoFocus
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        fullWidth
                        onClick={() => {
                          setReactivatingEvent(null);
                          setReactivateEndDate('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        fullWidth
                        disabled={isVacation && !reactivateEndDate}
                        onClick={() => {
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
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={ev.id} className="surface rounded-xl">
                <div className="flex items-start gap-3 p-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: ev.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{ev.name}</p>
                    <p className="text-[10px] text-tertiary mt-0.5 truncate">#{ev.hashtag}</p>
                    <p className="text-[10px] text-tertiary truncate">{trackedDateLabel}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => {
                        if (endDatePast) {
                          setReactivatingEvent(ev);
                          setReactivateEndDate(ev.endDate ? epochToDateInput(ev.endDate) : '');
                        } else {
                          reactivateEvent(ev.id);
                        }
                      }}
                      className="text-xs text-secondary border border-theme rounded-lg px-2.5 py-1"
                    >
                      Reactivate
                    </button>
                    {linkedCount > 0 ? (
                      <span className="text-[10px] text-tertiary border border-theme rounded-lg px-2 py-1">
                        {linkedCount} linked
                      </span>
                    ) : (
                      <button
                        onClick={() => demoteEvent(ev.id)}
                        className="text-xs text-tertiary border border-theme rounded-lg px-2.5 py-1"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
