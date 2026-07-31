import type { ReactNode } from 'react';
import { Modal, Button } from '@/components/ui';

interface FormModalProps {
  title: string;
  onClose: () => void;
  onSave: () => void;
  onDelete?: (() => void) | undefined;
  saving?: boolean;
  /** Label for the primary save button. Default "Save". */
  saveLabel?: string;
  /** Label for the danger delete button. Default "Delete". */
  deleteLabel?: string;
  children: ReactNode;
  scrollable?: boolean;
  size?: 'sm' | 'md';
  nested?: boolean;
}

export function FormModal({
  title,
  onClose,
  onSave,
  onDelete,
  saving = false,
  saveLabel = 'Save',
  deleteLabel = 'Delete',
  children,
  scrollable = true,
  size,
  nested
}: FormModalProps) {
  return (
    <Modal
      onClose={onClose}
      title={title}
      scrollable={scrollable}
      size={size}
      nested={nested}
      footer={
        <div className="flex gap-3">
          {onDelete && (
            <Button variant="danger" fullWidth onClick={onDelete}>
              {deleteLabel}
            </Button>
          )}
          <Button variant="primary" fullWidth onClick={onSave} loading={saving}>
            {saving ? 'Saving…' : saveLabel}
          </Button>
        </div>
      }
    >
      {children}
    </Modal>
  );
}
