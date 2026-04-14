"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Search,
  ShieldCheck,
  History,
  Settings,
  Database,
  Terminal,
  Cpu
} from "lucide-react"
import { cn } from "@/lib/utils"

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'New Scan', href: '/scan', icon: Search },
  { name: 'History', href: '/history', icon: History },
  { name: 'Rule Registry', href: '/rules', icon: Database },
  { name: 'Vulnerabilities', href: '/vulnerabilities', icon: ShieldCheck },
  { name: 'Agent Terminal', href: '/terminal', icon: Terminal },
]

const settings = [
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex h-full w-64 flex-col bg-card border-r border-border/50">
      <div className="flex h-16 shrink-0 items-center px-6 gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center glow-primary">
          <Cpu className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-bold gradient-text">SCA</span>
      </div>

      <nav className="flex flex-1 flex-col px-4 mt-4">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      pathname === item.href
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-white/5 hover:text-white',
                      'group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6 transition-all duration-200'
                    )}
                  >
                    <item.icon
                      className={cn(
                        pathname === item.href ? 'text-primary' : 'text-muted-foreground group-hover:text-white',
                        'h-5 w-5 shrink-0 transition-colors'
                      )}
                      aria-hidden="true"
                    />
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </li>

          <li className="mt-auto mb-4">
            <ul role="list" className="-mx-2 space-y-1">
              {settings.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      pathname === item.href
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-white/5 hover:text-white',
                      'group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6 transition-all duration-200'
                    )}
                  >
                    <item.icon
                      className={cn(
                        pathname === item.href ? 'text-primary' : 'text-muted-foreground group-hover:text-white',
                        'h-5 w-5 shrink-0 transition-colors'
                      )}
                      aria-hidden="true"
                    />
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        </ul>
      </nav>
    </div>
  )
}
