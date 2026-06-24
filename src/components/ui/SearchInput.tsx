interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }: SearchInputProps) {
  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border border-theme bg-surface-2 ${className}`}>
      <i className="ti ti-search text-tertiary" style={{ fontSize: 15 }} aria-hidden="true" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm text-primary placeholder:text-tertiary focus:outline-none"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} className="text-tertiary" aria-label="Clear search">
          <i className="ti ti-x" style={{ fontSize: 13 }} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
