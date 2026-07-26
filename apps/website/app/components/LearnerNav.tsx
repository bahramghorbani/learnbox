type Destination = 'today' | 'words' | 'progress';

interface LearnerNavProps {
  current: Destination;
  onNavigate: (destination: Destination) => void;
}

const destinations: Array<{ id: Destination; label: string }> = [
  { id: 'today', label: 'امروز' },
  { id: 'words', label: 'واژه‌ها' },
  { id: 'progress', label: 'پیشرفت' },
];

export function LearnerNav({ current, onNavigate }: LearnerNavProps) {
  return (
    <nav className="learner-nav" aria-label="ناوبری اصلی">
      {destinations.map((destination) => (
        <button
          key={destination.id}
          className={current === destination.id ? 'learner-nav-active' : ''}
          type="button"
          aria-current={current === destination.id ? 'page' : undefined}
          onClick={() => onNavigate(destination.id)}
        >
          {destination.label}
        </button>
      ))}
    </nav>
  );
}
