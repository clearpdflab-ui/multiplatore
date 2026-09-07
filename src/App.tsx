import { useState } from 'react';
import { ViewMode, UserMatch } from './types';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { MathematicalAnalysis } from './components/MathematicalAnalysis';
import { PracticalSimulator } from './components/PracticalSimulator';
import { LiveSlipTracker } from './components/LiveSlipTracker';
import { CalendarOddsMonitor } from './components/CalendarOddsMonitor';
import { BooksManager } from './components/BooksManager';
import { CyclesDashboard } from './components/CyclesDashboard';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('live_slips');
  const [importedMatches, setImportedMatches] = useState<UserMatch[] | null>(null);

  const handleImportMatches = (matches: UserMatch[]) => {
    setImportedMatches(matches);
  };

  return (
    <div className="min-h-screen w-full bg-[#0A0B10] text-[#E0E2E7] font-sans flex flex-col selection:bg-[#3B82F6]/30">
      {/* Header */}
      <Header currentView={currentView} onViewChange={setCurrentView} />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {currentView === 'calendar_odds' ? (
          <CalendarOddsMonitor
            onImportToTracker={handleImportMatches}
            onNavigateToTracker={() => setCurrentView('live_slips')}
          />
        ) : currentView === 'live_slips' ? (
          <LiveSlipTracker
            importedMatches={importedMatches}
            onOpenCalendar={() => setCurrentView('calendar_odds')}
          />
        ) : currentView === 'practical' ? (
          <PracticalSimulator />
        ) : currentView === 'books' ? (
          <BooksManager />
        ) : currentView === 'cycles' ? (
          <CyclesDashboard />
        ) : (
          <MathematicalAnalysis />
        )}
      </main>

      {/* Footer */}
      <Footer currentView={currentView} onViewChange={setCurrentView} />
    </div>
  );
}
