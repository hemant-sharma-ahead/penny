import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Modal, Button } from '~/components/ui';

interface FormModalProps {
  title: string;
  onClose: () => void;
  onSave: () => void;
  onDelete?: (() => void) | undefined;
  saving?: boolean;
  /** Disables the primary save button — e.g. required-field validation. Default false. */
  saveDisabled?: boolean;
  /** Label for the primary save button. Default "Save". */
  saveLabel?: string;
  /** Label for the danger delete button. Default "Delete". */
  deleteLabel?: string;
  /** Adds an explicit Cancel button to the footer — most callers rely on the modal's own X/backdrop
   *  dismissal (matching their web equivalent's `FormModal`, which also has no Cancel button), but a few
   *  (e.g. Accounts) have a web counterpart with its own hand-rolled footer that does include one.
   *  Default false. */
  showCancel?: boolean;
  children: ReactNode;
  scrollable?: boolean;
  size?: 'sm' | 'md';
}

/**
 * RN port note: `nested` (web's z-index stacking prop) is dropped — RN's `Modal` already stacks as a
 * separate native layer (see `components/ui/Modal.tsx`'s own port note). Each footer button is wrapped in
 * its own `flex-1` View rather than relying on `fullWidth` alone — two `fullWidth` (`w-full`) siblings in
 * a `flex-row` overflow instead of splitting evenly, since RN's Yoga layout engine defaults `flexShrink`
 * to 0 (CSS flexbox defaults to 1) — found and fixed in the Subscriptions pilot, applied here from the
 * start since every consumer of this shared component would otherwise hit the same bug.
 */
export function FormModal({
  title,
  onClose,
  onSave,
  onDelete,
  saving = false,
  saveDisabled = false,
  saveLabel = 'Save',
  deleteLabel = 'Delete',
  showCancel = false,
  children,
  scrollable = true,
  size
}: FormModalProps) {
  return (
    <Modal
      onClose={onClose}
      title={title}
      scrollable={scrollable}
      size={size}
      footer={
        <View className="flex-row gap-3">
          {showCancel && (
            <View className="flex-1">
              <Button variant="secondary" fullWidth onPress={onClose}>
                Cancel
              </Button>
            </View>
          )}
          {onDelete && (
            <View className="flex-1">
              <Button variant="danger" fullWidth onPress={onDelete}>
                {deleteLabel}
              </Button>
            </View>
          )}
          <View className="flex-1">
            <Button variant="primary" fullWidth onPress={onSave} loading={saving} disabled={saveDisabled}>
              {saving ? 'Saving…' : saveLabel}
            </Button>
          </View>
        </View>
      }
    >
      {children}
    </Modal>
  );
}
