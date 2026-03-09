import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Portfolio', icon: '📊' },
  { to: '/compare', label: 'Compare', icon: '⚖️' },
  { to: '/btc', label: 'Bitcoin', icon: '₿' },
  { to: '/weather', label: 'Weather', icon: '🌤' },
  { to: '/trades', label: 'Trades', icon: '📋' },
  { to: '/analytics', label: 'Analytics', icon: '📈' },
];

function NavItem({ item, mobile = false }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        [
          'flex items-center transition',
          mobile ? 'flex-col gap-0.5 rounded-md px-2 py-1 text-[11px]' : 'gap-3 rounded-md px-3 py-2',
          isActive
            ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
            : 'text-slate-300 hover:bg-slate-700 hover:text-slate-100',
        ].join(' ')
      }
    >
      <span className={mobile ? 'text-base' : 'text-lg'}>{item.icon}</span>
      <span className={mobile ? 'leading-none' : 'whitespace-nowrap text-sm font-medium'}>
        {item.label}
      </span>
    </NavLink>
  );
}

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="hidden w-[220px] flex-col border-r border-slate-700 bg-slate-800 p-2 md:flex">
        <div className="mb-4 truncate px-2 pt-2 text-xs uppercase tracking-widest text-slate-400">
          Polymarket Dashboard
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavItem key={item.to} item={item} />
          ))}
        </nav>
      </aside>

      <main className="flex-1 bg-slate-950 px-4 pb-24 pt-4 md:px-6 md:pb-6 md:pt-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-700 bg-slate-900/95 px-2 py-2 backdrop-blur md:hidden">
        <div className="grid grid-cols-6 gap-1">
          {navItems.map((item) => (
            <NavItem key={item.to} item={item} mobile />
          ))}
        </div>
      </nav>
    </div>
  );
}
