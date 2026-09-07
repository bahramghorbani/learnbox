export type LearnerDestination = 'today' | 'words' | 'progress' | 'profile';

interface LearnerNavProps {
  current: LearnerDestination;
  onNavigate: (destination: LearnerDestination) => void;
}

const destinations: Array<{ id: LearnerDestination; label: string }> = [
  { id: 'today', label: 'امروز' },
  { id: 'words', label: 'واژه‌ها' },
  { id: 'progress', label: 'پیشرفت' },
  { id: 'profile', label: 'پروفایل' },
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
