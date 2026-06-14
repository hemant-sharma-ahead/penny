import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type EventSubtype = 'immersive' | 'background';

export interface ActiveEvent {
  id: string;
  name: string;
  subtype: EventSubtype;
  hashtag: string;
  startDate: number;
  endDate?: number;
  autoTag: boolean;
  color: string;
}

interface EventModeContextValue {
  events: ActiveEvent[];
  pastEvents: ActiveEvent[];
  allEventHashtags: Set<string>;
  addEvent: (event: Omit<ActiveEvent, 'id'>) => void;
  stopEvent: (id: string) => void;
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

function loadPastEvents(): ActiveEvent[] {
  try {
    return JSON.parse(localStorage.getItem(PAST_LS_KEY) ?? '[]') as ActiveEvent[];
  } catch {
    return [];
  }
}

function loadActiveEvents(): ActiveEvent[] {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as ActiveEvent[];
    const now = Date.now();
    const live = all.filter((e) => !e.endDate || e.endDate > now);
    const expired = all.filter((e) => e.endDate && e.endDate <= now);
    // Archive expired events immediately on load
    if (expired.length > 0) {
      const past = loadPastEvents();
      const existingIds = new Set(past.map((e) => e.id));
      persistPastEvents([...past, ...expired.filter((e) => !existingIds.has(e.id))]);
      persistEvents(live);
    }
    return live;
  } catch {
    return [];
  }
}

function persistEvents(events: ActiveEvent[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(events));
}

function persistPastEvents(events: ActiveEvent[]) {
  localStorage.setItem(PAST_LS_KEY, JSON.stringify(events));
}

const EventModeContext = createContext<EventModeContextValue | null>(null);

export function EventModeProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<ActiveEvent[]>(loadActiveEvents);
  const [pastEvents, setPastEvents] = useState<ActiveEvent[]>(loadPastEvents);

  // Re-sync if seedDemoData ran after initial mount (seeds penny_past_events then dispatches this event)
  useEffect(() => {
    const handler = () => setPastEvents(loadPastEvents());
    window.addEventListener('penny-events-updated', handler);
    return () => window.removeEventListener('penny-events-updated', handler);
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
      persistEvents(live);
      setEvents(live);

      const existingIds = new Set(pastEventsRef.current.map((e) => e.id));
      const toAdd = expired.filter((e) => !existingIds.has(e.id));
      if (toAdd.length > 0) {
        const newPast = [...pastEventsRef.current, ...toAdd];
        persistPastEvents(newPast);
        setPastEvents(newPast);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const addEvent = useCallback((ev: Omit<ActiveEvent, 'id'>) => {
    setEvents((prev) => {
      const next = [...prev, { ...ev, id: crypto.randomUUID() }];
      persistEvents(next);
      return next;
    });
  }, []);

  const stopEvent = useCallback((id: string) => {
    const toArchive = eventsRef.current.find((e) => e.id === id);
    setEvents((prev) => {
      const next = prev.filter((e) => e.id !== id);
      persistEvents(next);
      return next;
    });
    if (toArchive) {
      const archived = { ...toArchive, endDate: toArchive.endDate ?? Date.now() };
      setPastEvents((past) => {
        if (past.some((p) => p.id === id)) return past;
        const updated = [...past, archived];
        persistPastEvents(updated);
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
      persistPastEvents(updated);
      return updated;
    });
  }, []);

  // Remove an event from past events (undo promote, or clear old events)
  const demoteEvent = useCallback((id: string) => {
    setPastEvents((past) => {
      const updated = past.filter((e) => e.id !== id);
      persistPastEvents(updated);
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

  return (
    <EventModeContext.Provider
      value={{ events, pastEvents, allEventHashtags, addEvent, stopEvent, promoteHashtagToEvent, demoteEvent }}
    >
      {children}
    </EventModeContext.Provider>
  );
}

export function useEventMode() {
  const ctx = useContext(EventModeContext);
  if (!ctx) throw new Error('useEventMode must be used inside EventModeProvider');
  return ctx;
}
