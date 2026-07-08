import React from 'react';

export default function Tabs({ tabs, activeTab, onTabChange }) {
  return (
    <div className="border-b border-zinc-800">
      <nav className="-mb-px flex space-x-6 overflow-x-auto px-6">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-bold text-xs uppercase tracking-widest transition-colors ${
                isActive
                  ? 'border-[var(--brand)] text-[var(--brand)]'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
