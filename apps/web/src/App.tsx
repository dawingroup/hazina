import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { auth } from './lib/firebase';
import { cn } from './lib/utils';
import { Button } from './components/ui/button';
import { SignIn } from './pages/SignIn';
import { Overview } from './pages/Overview';
import { CashFlow } from './pages/CashFlow';
import { Coverage } from './pages/Coverage';
import { Expenses } from './pages/Expenses';
import { Placeholder } from './pages/Placeholder';

const NAV = [
  { to: '/', label: 'Wealth overview' },
  { to: '/assets', label: 'Assets' },
  { to: '/liabilities', label: 'Liabilities' },
  { to: '/expenses', label: 'Projected expenses' },
  { to: '/cash-flow', label: 'Cash flow' },
  { to: '/coverage', label: 'Coverage' },
];

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return null;
  if (!user) return <SignIn />;

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-border p-4">
        <p className="mb-6 text-lg font-semibold">Hazina</p>
        <nav className="flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm hover:bg-muted',
                  isActive && 'bg-muted font-medium',
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <Button variant="ghost" className="mt-6 w-full justify-start" onClick={() => signOut(auth)}>
          Sign out
        </Button>
      </aside>
      <main className="flex-1 p-8">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route
            path="/assets"
            element={
              <Placeholder
                title="Assets"
                sprint={2}
                what="Split by class, entity, currency and liquidity tier, with a drill-down table."
              />
            }
          />
          <Route
            path="/liabilities"
            element={
              <Placeholder
                title="Liabilities"
                sprint={3}
                what="Balances, rates, monthly repayments and what each loan is secured on."
              />
            }
          />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/cash-flow" element={<CashFlow />} />
          <Route path="/coverage" element={<Coverage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
