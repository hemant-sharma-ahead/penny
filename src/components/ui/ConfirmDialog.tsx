import { Modal } from './Modal';
import { Button } from './Button';

type ConfirmVariant = 'danger' | 'primary';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ConfirmVariant;
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  loading
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <Modal
      onClose={onClose}
      title={title}
      size="sm"
      nested
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} fullWidth onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-secondary leading-relaxed">{message}</p>
    </Modal>
  );
}
