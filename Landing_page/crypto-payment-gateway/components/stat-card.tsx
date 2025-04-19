import type React from "react"
interface StatCardProps {
  title: string
  value: string
  icon: React.ReactNode
  gradientFrom?: string
  gradientTo?: string
}

export function StatCard({
  title,
  value,
  icon,
  gradientFrom = "from-teal-400",
  gradientTo = "to-blue-500",
}: StatCardProps) {
  return (
    <div className="relative group overflow-hidden rounded-xl border border-white/10 bg-black/30 p-6 transition-all duration-300 hover:shadow-lg hover:shadow-teal-500/10 hover:-translate-y-1">
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradientFrom} ${gradientTo} opacity-5 group-hover:opacity-10 transition-opacity duration-300`}
      ></div>
      <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-teal-500/20 to-blue-500/20 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100"></div>

      <div className="relative flex flex-col h-full">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-teal-400">
          {icon}
        </div>
        <h3 className="mb-1 text-lg font-medium text-white">{title}</h3>
        <p className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
          {value}
        </p>
      </div>
    </div>
  )
}
