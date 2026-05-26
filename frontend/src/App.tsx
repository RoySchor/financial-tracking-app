import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import MonthView from './pages/MonthView';
import Trends from './pages/Trends';
import Income from './pages/Income';
import Assets from './pages/Assets';
import Categories from './pages/Categories';
import Recurring from './pages/Recurring';
import AddExpense from './pages/AddExpense';
import Portfolio from './pages/Portfolio';
import HoldingsDetail from './pages/HoldingsDetail';
import InvestmentActivity from './pages/InvestmentActivity';
import ManualAccountDetail from './pages/ManualAccountDetail';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/month', label: 'Month' },
  { to: '/trends', label: 'Trends' },
  { to: '/income', label: 'Income' },
  { to: '/assets', label: 'Non-Synced' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/categories', label: 'Categories' },
  { to: '/recurring', label: 'Recurring' },
  { to: '/add', label: 'Add Cash Expense' },
];

function useDarkMode() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') !== 'light');

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [dark]);

  return [dark, setDark] as const;
}

export default function App() {
  const [dark, setDark] = useDarkMode();

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3">
          <div className="max-w-7xl mx-auto flex gap-4 overflow-x-auto items-center">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={() => setDark(!dark)}
              className="ml-auto px-3 py-2 rounded-md text-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              aria-label="Toggle dark mode"
            >
              {dark ? '☀️' : '🌙'}
            </button>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/month" element={<MonthView />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/income" element={<Income />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/portfolio" element={<Portfolio />} />
            {/* Static paths must precede :accountId param to avoid matching as an ID */}
            <Route path="/portfolio/activity" element={<InvestmentActivity />} />
            <Route path="/portfolio/manual/:assetId" element={<ManualAccountDetail />} />
            <Route path="/portfolio/:accountId" element={<HoldingsDetail />} />
            <Route path="/recurring" element={<Recurring />} />
            <Route path="/add" element={<AddExpense />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
