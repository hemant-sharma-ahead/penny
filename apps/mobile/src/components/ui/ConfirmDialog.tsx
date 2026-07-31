import { View, Text } from 'react-native';
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
      footer={
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button variant="secondary" fullWidth onPress={onClose} disabled={loading}>
              {cancelLabel}
            </Button>
          </View>
          <View className="flex-1">
            <Button variant={confirmVariant} fullWidth onPress={onConfirm} loading={loading}>
              {confirmLabel}
            </Button>
          </View>
        </View>
      }
    >
      <Text className="text-sm text-secondary leading-relaxed">{message}</Text>
    </Modal>
  );
}
