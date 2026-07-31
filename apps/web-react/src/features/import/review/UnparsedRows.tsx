import { useState } from 'react';
import { Button, TextInput } from '@/components/ui';
import { STATUS, tint } from '@/lib/statusColors';
import type { RejectedRow } from '@/core/import/importParsers';
import type { ColumnMapping } from '@/core/import/importMatcher';

function RejectedRowEditor({
  row,
  mapping,
  onFix
}: {
  row: RejectedRow;
  mapping: ColumnMapping | null;
  onFix: (fields: { date: string; amount: string; description: string }) => boolean;
}) {
  const [date, setDate] = useState(mapping && mapping.date >= 0 ? (row.raw[mapping.date] ?? '') : '');
  const [amount, setAmount] = useState(mapping && mapping.amount >= 0 ? (row.raw[mapping.amount] ?? '') : '');
  const [description, setDescription] = useState(
    mapping && mapping.description >= 0 ? (row.raw[mapping.description] ?? '') : ''
  );
  const [fixed, setFixed] = useState(false);

  if (fixed) return null;

  return (
    <div className="flex flex-col gap-2 py-2 border-b border-dashed" style={{ borderColor: tint(STATUS.warning, 45) }}>
      <p className="text-[11px]" style={{ color: STATUS.warning }}>
        Row {row.rowIndex} · {row.reason}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <TextInput label="Date" value={date} onChange={setDate} placeholder="DD/MM/YYYY" />
        <TextInput label="Amount" value={amount} onChange={setAmount} placeholder="0.00" />
        <TextInput label="Description" value={description} onChange={setDescription} placeholder="What was this?" />
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          if (onFix({ date, amount, description })) setFixed(true);
        }}
      >
        Include this row
      </Button>
    </div>
  );
}

interface UnparsedRowsProps {
  rejectedRows: RejectedRow[];
  mapping: ColumnMapping | null;
  onFixRejected: (rowIndex: number, fields: { date: string; amount: string; description: string }) => boolean;
}

/** "Rows needing attention" — structurally unparsed rows (missing date/amount/description), kept
 *  visually distinct (amber/warning tone) from category-undecided state per the approved mockup, so a
 *  user never confuses "structurally broken" with "category undecided". */
export function UnparsedRows({ rejectedRows, mapping, onFixRejected }: UnparsedRowsProps) {
  const [expanded, setExpanded] = useState(true);
  if (rejectedRows.length === 0) return null;

  return (
    <div
      className="rounded-xl overflow-hidden bg-warning-subtle"
      style={{ border: `1px solid ${tint(STATUS.warning, 45)}` }}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-2 p-3 text-left"
      >
        <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: STATUS.warning }}>
          <i className="ti ti-alert-triangle" aria-hidden="true" />
          {rejectedRows.length} row{rejectedRows.length !== 1 ? 's' : ''} need fixing before they can be categorized
        </span>
        <i
          className={`ti ti-chevron-${expanded ? 'up' : 'down'}`}
          style={{ color: STATUS.warning }}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-dashed" style={{ borderColor: tint(STATUS.warning, 45) }}>
          {rejectedRows.map((row) => (
            <RejectedRowEditor
              key={row.rowIndex}
              row={row}
              mapping={mapping}
              onFix={(fields) => onFixRejected(row.rowIndex, fields)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
