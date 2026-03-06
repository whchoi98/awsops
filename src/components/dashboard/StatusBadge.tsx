interface StatusBadgeProps {
  status: string;
}

type BadgeColor = {
  bg: string;
  text: string;
  dot: string;
};

const statusColorMap: Record<string, BadgeColor> = {
  // Green statuses
  running:   { bg: 'bg-accent-green/10', text: 'text-accent-green', dot: 'bg-accent-green' },
  active:    { bg: 'bg-accent-green/10', text: 'text-accent-green', dot: 'bg-accent-green' },
  ready:     { bg: 'bg-accent-green/10', text: 'text-accent-green', dot: 'bg-accent-green' },
  ok:        { bg: 'bg-accent-green/10', text: 'text-accent-green', dot: 'bg-accent-green' },
  healthy:   { bg: 'bg-accent-green/10', text: 'text-accent-green', dot: 'bg-accent-green' },
  succeeded: { bg: 'bg-accent-green/10', text: 'text-accent-green', dot: 'bg-accent-green' },
  available: { bg: 'bg-accent-green/10', text: 'text-accent-green', dot: 'bg-accent-green' },
  // Red statuses
  stopped:          { bg: 'bg-accent-red/10', text: 'text-accent-red', dot: 'bg-accent-red' },
  error:            { bg: 'bg-accent-red/10', text: 'text-accent-red', dot: 'bg-accent-red' },
  failed:           { bg: 'bg-accent-red/10', text: 'text-accent-red', dot: 'bg-accent-red' },
  alarm:            { bg: 'bg-accent-red/10', text: 'text-accent-red', dot: 'bg-accent-red' },
  crashloopbackoff: { bg: 'bg-accent-red/10', text: 'text-accent-red', dot: 'bg-accent-red' },
  // Orange statuses
  pending:  { bg: 'bg-accent-orange/10', text: 'text-accent-orange', dot: 'bg-accent-orange' },
  creating: { bg: 'bg-accent-orange/10', text: 'text-accent-orange', dot: 'bg-accent-orange' },
  warning:  { bg: 'bg-accent-orange/10', text: 'text-accent-orange', dot: 'bg-accent-orange' },
  // Gray statuses
  terminated:  { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-500' },
  terminating: { bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-500' },
};

const defaultColor: BadgeColor = {
  bg: 'bg-gray-500/10',
  text: 'text-gray-400',
  dot: 'bg-gray-500',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = status.toLowerCase().replace(/[\s-_]/g, '');
  const colors = statusColorMap[normalized] ?? defaultColor;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {status}
    </span>
  );
}
