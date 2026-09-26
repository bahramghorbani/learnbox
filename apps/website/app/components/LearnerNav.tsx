export type LearnerDestination = 'today' | 'words' | 'store' | 'progress' | 'profile';

interface LearnerNavProps {
  current: LearnerDestination;
  onNavigate: (destination: LearnerDestination) => void;
}

const navIcons: Record<LearnerDestination, string> = {
  today: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="24" height="24" fill="currentColor"><path d="M216,115.54V208a8,8,0,0,1-8,8H160a8,8,0,0,1-8-8V160a8,8,0,0,0-8-8H112a8,8,0,0,0-8,8v48a8,8,0,0,1-8,8H48a8,8,0,0,1-8-8V115.54a8,8,0,0,1,2.62-5.92l80-75.54a8,8,0,0,1,10.77,0l80,75.54A8,8,0,0,1,216,115.54Z" opacity="0.2"/><path d="M219.31,108.68l-80-75.54a16,16,0,0,0-22.62,0l-80,75.54a16,16,0,0,0-4.69,11.32V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V160h32v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V120A16,16,0,0,0,219.31,108.68Z"/></svg>',
  words: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="24" height="24" fill="currentColor"><path d="M224,64V192a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V64a8,8,0,0,1,8-8H216A8,8,0,0,1,224,64Z" opacity="0.2"/><path d="M231.65,194.55a8,8,0,0,1-6.2,9.45l-24,5.09a8,8,0,0,1-9.45-6.2L154.26,38.44a8,8,0,0,1,6.2-9.45l24-5.09a8,8,0,0,1,9.45,6.2ZM112,32H88a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8h24a8,8,0,0,0,8-8V40A8,8,0,0,0,112,32ZM48,32H24a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H48a8,8,0,0,0,8-8V40A8,8,0,0,0,48,32Z"/></svg>',
  store: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="24" height="24" fill="currentColor"><path d="M32,120H224v72a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8Z" opacity="0.2"/><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM176,88a48,48,0,0,1-96,0,8,8,0,0,1,16,0,32,32,0,0,0,64,0,8,8,0,0,1,16,0Z"/></svg>',
  progress: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="24" height="24" fill="currentColor"><path d="M208,40V216H48V104h48V40Z" opacity="0.2"/><path d="M224,200h-8V40a8,8,0,0,0-8-8H152a8,8,0,0,0-8,8V80H96a8,8,0,0,0-8,8v32H48a8,8,0,0,0-8,8v72H32a8,8,0,0,0,0,16H224a8,8,0,0,0,0-16ZM160,48h40V200H160ZM104,96h40V200H104ZM56,136H88v64H56Z"/></svg>',
  profile: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="24" height="24" fill="currentColor"><path d="M168,56a40,40,0,1,1-40-40A40,40,0,0,1,168,56Z" opacity="0.2"/><path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8C55.71,192.94,83.37,176,128,176s72.29,16.94,89.07,44a8,8,0,1,0,13.85-8Z"/></svg>',
};

const destinations: Array<{ id: LearnerDestination; label: string }> = [
  { id: 'today', label: 'امروز' },
  { id: 'words', label: 'واژه‌ها' },
  { id: 'store', label: 'فروشگاه' },
  { id: 'progress', label: 'پیشرفت' },
  { id: 'profile', label: 'پروفایل' },
];

export function LearnerNav({ current, onNavigate }: LearnerNavProps) {
  return (
    <nav className="learner-nav" aria-label="ناوبری اصلی">
      {destinations.map((dest) => (
        <button
          key={dest.id}
          className={current === dest.id ? 'learner-nav-active' : ''}
          type="button"
          aria-current={current === dest.id ? 'page' : undefined}
          onClick={() => onNavigate(dest.id)}
        >
          <span
            className="nav-icon"
            dangerouslySetInnerHTML={{ __html: navIcons[dest.id] }}
          />
          <span className="nav-label">{dest.label}</span>
          <span className="nav-dot" />
        </button>
      ))}
    </nav>
  );
}
