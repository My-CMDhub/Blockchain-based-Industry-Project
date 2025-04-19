import type React from "react"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
  gradientFrom?: string
  gradientTo?: string
}

export function FeatureCard({
  icon,
  title,
  description,
  gradientFrom = "from-teal-400",
  gradientTo = "to-blue-500",
}: FeatureCardProps) {
  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-teal-500/10 border-white/10 bg-black/30 hover:-translate-y-1">
      <CardHeader className="p-6 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-teal-400 group-hover:bg-gradient-to-r group-hover:from-teal-400 group-hover:to-blue-500 group-hover:text-white transition-colors duration-300 relative z-10">
          {icon}
        </div>
        <CardTitle className="relative z-10">{title}</CardTitle>
        <CardDescription className="relative z-10">{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}
