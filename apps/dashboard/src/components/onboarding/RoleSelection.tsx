'use client'

import { Building2, Crown, User, ArrowRight } from 'lucide-react';

export type OnboardingRole = 'developer' | 'admin' | 'individual';

interface RoleOption {
  id: OnboardingRole;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const roleOptions: RoleOption[] = [
  {
    id: 'developer',
    icon: <Building2 className="w-6 h-6" />,
    title: 'Join my team',
    description: 'Sync approved configs from your workspace',
  },
  {
    id: 'admin',
    icon: <Crown className="w-6 h-6" />,
    title: 'Set up my organization',
    description: 'Configure approved settings for your team',
  },
  {
    id: 'individual',
    icon: <User className="w-6 h-6" />,
    title: 'Try it personally',
    description: 'Explore GAL with your own projects',
  },
];

interface RoleSelectionProps {
  onSelect: (role: OnboardingRole) => void;
}

export function RoleSelection({ onSelect }: RoleSelectionProps) {
  return (
    <div className="max-w-xl space-y-4">
      {roleOptions.map((option) => (
        <button
          key={option.id}
          onClick={() => onSelect(option.id)}
          className="w-full p-5 rounded-xl text-left group transition-all flex items-center gap-4 hover:border-[var(--accent)]"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors group-hover:bg-[var(--accent)] group-hover:text-[var(--text-on-accent)]"
            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent)' }}
          >
            {option.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
              {option.title}
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {option.description}
            </p>
          </div>
          <ArrowRight
            className="w-5 h-5 flex-shrink-0 transition-transform group-hover:translate-x-1"
            style={{ color: 'var(--text-muted)' }}
          />
        </button>
      ))}
    </div>
  );
}
