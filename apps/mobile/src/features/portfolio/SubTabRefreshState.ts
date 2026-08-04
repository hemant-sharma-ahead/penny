/**
 * Shared shape for "a sub-tab tells `PortfolioPage` about its own refresh action" — 2026-08-01, found
 * via your review: Equity's IPO and News sub-tabs each had their own refresh button in their own content
 * area, in a different position/style than Stocks/MF's (in the header). `IpoTab`/`NewsView` report their
 * current refresh handler (or `null` when refreshing isn't applicable right now — e.g. IPO's own
 * "Listed" internal sub-tab has nothing to refresh) via a plain callback prop; `PortfolioPage` renders
 * the one consolidated button in its header's `actions` slot regardless of which of Stocks/MF/IPO/News
 * is active, calling whichever handler is currently registered.
 */
export interface SubTabRefreshState {
  refresh: () => void;
  refreshing: boolean;
}

export type OnRefreshStateChange = (state: SubTabRefreshState | null) => void;
