import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import MonthView from './pages/MonthView';
import Trends from './pages/Trends';
import Income from './pages/Income';
import Assets from './pages/Assets';
import Categories from './pages/Categories';
import Recurring from './pages/Recurring';
import AddExpense from './pages/AddExpense';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/month', label: 'Month' },
  { to: '/trends', label: 'Trends' },
  { to: '/income', label: 'Income' },
  { to: '/assets', label: 'Assets' },
  { to: '/categories', label: 'Categories' },
  { to: '/recurring', label: 'Recurring' },
  { to: '/add', label: 'Add Expense' },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="max-w-7xl mx-auto flex gap-4 overflow-x-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
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
            <Route path="/recurring" element={<Recurring />} />
            <Route path="/add" element={<AddExpense />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
