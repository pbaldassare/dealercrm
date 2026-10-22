import { NavLink, Outlet } from 'react-router-dom'
import { navForRole } from '../../lib/nav'
import { useSession } from '../../lib/session'

export function AppShell() {
  const { profile, signOut } = useSession()
  const items = navForRole(profile?.role)

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-[#f8f4ef] pb-20">
      <header className="flex items-center justify-between px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[#c45c26]">EtiDeal</p>
          <p className="text-sm text-[#5c6578]">{profile?.full_name}</p>
        </div>
        <button type="button" className="min-h-11 text-sm font-medium" onClick={() => void signOut()}>
          Esci
        </button>
      </header>
      <Outlet />
      <nav className="fixed bottom-0 left-1/2 flex w-full max-w-[430px] -translate-x-1/2 flex-wrap justify-around gap-y-1 border-t border-[#e6ddd2] bg-white py-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `min-h-11 min-w-11 px-2 text-center text-[13px] font-medium ${isActive ? 'text-[#c45c26]' : 'text-[#5c6578]'}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
