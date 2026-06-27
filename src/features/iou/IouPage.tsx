import { PageHeader } from '@/components/ui';
import { IouView } from './IouView';

export function IouPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader title="IOUs" />
      <IouView />
    </div>
  );
}
