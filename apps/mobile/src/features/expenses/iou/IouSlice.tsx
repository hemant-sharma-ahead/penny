import { IouView } from '~/features/iou/IouView';

/**
 * The IOU tab embedded in the Expenses module. Privacy mode is read inside IouView, so this is a
 * thin wrapper around the shared experience (kept as a named slice for the Expenses tab strip).
 */
export function IouSlice() {
  return <IouView />;
}
