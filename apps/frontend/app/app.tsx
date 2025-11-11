import { useState } from 'react';
import { Sidebar, PageType } from '@/components/Sidebar';
import { DashboardPage } from '@/pages/DashboardPage';
import { ImportsPage } from '@/pages/ImportsPage';
import { TaxesPage } from '@/pages/TaxesPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { TransactionsPage } from '@/pages/TransactionsPage';
import { AlertsPage } from '@/pages/AlertsPage';

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage />;
      case 'imports':
        return <ImportsPage />;
      case 'taxes':
        return <TaxesPage />;
      case 'reports':
        return <ReportsPage />;
      case 'transactions':
        return <TransactionsPage />;
      case 'alerts':
        return <AlertsPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
      <main className="flex-1 p-8">
        {renderPage()}
      </main>
    </div>
  );
}

export default App;
