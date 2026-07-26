import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getJSON, setJSON } from '~/lib/storage';

export type EventSubtype = 'immersive' | 'background';

export interface ActiveEvent {
  id: string;
  name: string;
  subtype: EventSubtype;
  hashtag: string;
  startDate: number;
  endDate?: number | undefined;
  autoTag: boolean;
  color: string;
  /** Group this trip/event is linked to (Phase 1.5 Track E). When set, the Add flow can open the
   *  group shared-expense composer prefilled and split expenses with companions. */
  linkedGroupId?: string | undefined;
}

interface EventModeContextValue {
  events: ActiveEvent[];
  pastEvents: ActiveEvent[];
  allEventHashtags: Set<string>;
  addEvent: (event: Omit<ActiveEvent, 'id'>) => void;
  stopEvent: (id: string) => void;
  updateEvent: (id: string, updates: Partial<Omit<ActiveEvent, 'id'>>) => void;
  reactivateEvent: (id: string, overrides?: Partial<Omit<ActiveEvent, 'id'>>) => void;
  promoteHashtagToEvent: (tag: string) => void;
  demoteEvent: (id: string) => void;
}

const LS_KEY = 'penny_active_events';
const PAST_LS_KEY = 'penny_past_events';

export const EVENT_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

// Normalize hashtag for matching: lowercase, strip non-alphanumeric
// "LehLadakh" → "lehladakh", "leh-ladakh" → "lehladakh"
export function normalizeHashtag(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function toEventHashtag(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '');
}

// "leh-ladakh" → "Leh Ladakh"
function hashtagToDisplayName(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function loadPastEvents(): Promise<ActiveEvent[]> {
  return (await getJSON<ActiveEvent[]>(PAST_LS_KEY)) ?? [];
}

/** Splits stored events into still-live vs. expired, archiving any expired ones as a side effect —
 *  same "archive on load" behavior as web, just against async storage instead of sync localStorage. */
async function loadActiveEvents(): Promise<ActiveEvent[]> {
  const all = (await getJSON<ActiveEvent[]>(LS_KEY)) ?? [];
  const now = Date.now();
  const live = all.filter((e) => !e.endDate || e.endDate > now);
  const expired = all.filter((e) => e.endDate && e.endDate <= now);
  if (expired.length > 0) {
    const past = await loadPastEvents();
    const existingIds = new Set(past.map((e) => e.id));
    await persistPastEvents([...past, ...expired.filter((e) => !existingIds.has(e.id))]);
    await persistEvents(live);
  }
  return live;
}

function persistEvents(events: ActiveEvent[]) {
  return setJSON(LS_KEY, events);
}

function persistPastEvents(events: ActiveEvent[]) {
  return setJSON(PAST_LS_KEY, events);
}

const EventModeContext = createContext<EventModeContextValue | null>(null);

/**
 * RN port of apps/web-legacy/src/context/EventModeContext.tsx — same logic, unchanged; storage is async
 * (AsyncStorage) instead of sync `localStorage`, so `events`/`pastEvents` start empty and hydrate once in
 * an effect (same pattern as `PrivacyContext`'s async default-mode load). Web's `penny-events-updated`
 * DOM event (fired by `seedDemoData` after seeding `penny_past_events`) is dropped — mobile's demo
 * seeding isn't wired up yet (same "Session locked" limitation noted throughout Track 4).
 */
export function EventModeProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<ActiveEvent[]>([]);
  const [pastEvents, setPastEvents] = useState<ActiveEvent[]>([]);

  useEffect(() => {
    void loadActiveEvents().then(setEvents);
    void loadPastEvents().then(setPastEvents);
  }, []);

  // Refs so interval callbacks always see current state without stale closures
  const eventsRef = useRef(events);
  const pastEventsRef = useRef(pastEvents);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);
  useEffect(() => {
    pastEventsRef.current = pastEvents;
  }, [pastEvents]);

  // Periodically expire and archive immersive events whose endDate has passed
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const current = eventsRef.current;
      const expired = current.filter((e) => e.endDate && e.endDate <= now);
      if (expired.length === 0) return;

      const live = current.filter((e) => !e.endDate || e.endDate > now);
      void persistEvents(live);
      setEvents(live);

      const existingIds = new Set(pastEventsRef.current.map((e) => e.id));
      const toAdd = expired.filter((e) => !existingIds.has(e.id));
      if (toAdd.length > 0) {
        const newPast = [...pastEventsRef.current, ...toAdd];
        void persistPastEvents(newPast);
        setPastEvents(newPast);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const addEvent = useCallback((ev: Omit<ActiveEvent, 'id'>) => {
    setEvents((prev) => {
      const next = [...prev, { ...ev, id: crypto.randomUUID() }];
      void persistEvents(next);
      return next;
    });
  }, []);

  const stopEvent = useCallback((id: string) => {
    const toArchive = eventsRef.current.find((e) => e.id === id);
    setEvents((prev) => {
      const next = prev.filter((e) => e.id !== id);
      void persistEvents(next);
      return next;
    });
    if (toArchive) {
      const archived = { ...toArchive, endDate: toArchive.endDate ?? Date.now() };
      setPastEvents((past) => {
        if (past.some((p) => p.id === id)) return past;
        const updated = [...past, archived];
        void persistPastEvents(updated);
        return updated;
      });
    }
  }, []);

  // Manually promote a hashtag (e.g. #leh-ladakh) to a tracked event
  const promoteHashtagToEvent = useCallback((tag: string) => {
    setPastEvents((past) => {
      if (past.some((e) => normalizeHashtag(e.hashtag) === normalizeHashtag(tag))) return past;
      const newEvent: ActiveEvent = {
        id: `promoted-${crypto.randomUUID().slice(0, 8)}`,
        name: hashtagToDisplayName(tag),
        subtype: 'background',
        hashtag: tag,
        startDate: 0,
        autoTag: false,
        color: EVENT_COLORS[past.length % EVENT_COLORS.length] ?? '#ef4444'
      };
      const updated = [...past, newEvent];
      void persistPastEvents(updated);
      return updated;
    });
  }, []);

  const updateEvent = useCallback((id: string, updates: Partial<Omit<ActiveEvent, 'id'>>) => {
    setEvents((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, ...updates } : e));
      void persistEvents(next);
      return next;
    });
  }, []);

  // Move a past event back to active.
  // Background events always get endDate cleared (stopEvent stamps one on archive).
  // Vacation events: preserve a future endDate; caller supplies overrides when the stored one is past.
  const reactivateEvent = useCallback((id: string, overrides?: Partial<Omit<ActiveEvent, 'id'>>) => {
    setPastEvents((past) => {
      const ev = past.find((e) => e.id === id);
      if (!ev) return past;
      const endDate = ev.subtype === 'background' ? undefined : ev.endDate;
      const reactivated: ActiveEvent = { ...ev, endDate, ...overrides };
      setEvents((active) => {
        if (active.some((e) => e.id === id)) return active;
        const next = [...active, reactivated];
        void persistEvents(next);
        return next;
      });
      const updated = past.filter((e) => e.id !== id);
      void persistPastEvents(updated);
      return updated;
    });
  }, []);

  // Remove an event from past events (undo promote, or clear old events)
  const demoteEvent = useCallback((id: string) => {
    setPastEvents((past) => {
      const updated = past.filter((e) => e.id !== id);
      void persistPastEvents(updated);
      return updated;
    });
  }, []);

  // Normalized set of all event hashtags (active + past) for fast lookup
  const allEventHashtags = useMemo(() => {
    const set = new Set<string>();
    for (const e of [...events, ...pastEvents]) {
      set.add(normalizeHashtag(e.hashtag));
    }
    return set;
  }, [events, pastEvents]);

  const value = useMemo(
    () => ({
      events,
      pastEvents,
      allEventHashtags,
      addEvent,
      stopEvent,
      updateEvent,
      reactivateEvent,
      promoteHashtagToEvent,
      demoteEvent
    }),
    [
      events,
      pastEvents,
      allEventHashtags,
      addEvent,
      stopEvent,
      updateEvent,
      reactivateEvent,
      promoteHashtagToEvent,
      demoteEvent
    ]
  );

  return <EventModeContext.Provider value={value}>{children}</EventModeContext.Provider>;
}

export function useEventMode() {
  const ctx = useContext(EventModeContext);
  if (!ctx) throw new Error('useEventMode must be used inside EventModeProvider');
  return ctx;
}
