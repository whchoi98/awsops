'use client';

interface NamespaceFilterProps {
  namespaces: string[];
  selected: string;
  onChange: (namespace: string) => void;
}

export default function NamespaceFilter({ namespaces, selected, onChange }: NamespaceFilterProps) {
  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-gray-300 font-mono focus:outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 appearance-none cursor-pointer"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
        backgroundPosition: 'right 0.5rem center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '1.5em 1.5em',
        paddingRight: '2.5rem',
      }}
    >
      <option value="">All Namespaces</option>
      {namespaces.map((ns) => (
        <option key={ns} value={ns}>
          {ns}
        </option>
      ))}
    </select>
  );
}
