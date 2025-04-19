"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Ethereum3DModel } from "@/components/ethereum-3d-model"
import { EclipseIcon as Ethereum, Lock, RefreshCcw, Palette } from "lucide-react"

export function PaymentCard() {
  const [colorScheme, setColorScheme] = useState<"teal" | "purple" | "blue" | "gold">("teal")

  // Rotate through color schemes
  const cycleColorScheme = () => {
    const schemes: Array<"teal" | "purple" | "blue" | "gold"> = ["teal", "purple", "blue", "gold"]
    const currentIndex = schemes.indexOf(colorScheme)
    const nextIndex = (currentIndex + 1) % schemes.length
    setColorScheme(schemes[nextIndex])
  }

  return (
    <div className="relative w-full max-w-[500px] overflow-hidden rounded-xl border border-white/10 bg-black/30 p-4 shadow-xl">
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-teal-400/10 blur-3xl"></div>
      <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl"></div>
      <div className="relative rounded-lg border border-white/10 bg-black/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <Ethereum className="h-5 w-5 text-teal-400" />
            <span className="font-medium">Payment Request</span>
          </div>
          <div className="text-sm text-muted-foreground">Transaction #38291</div>
        </div>
        <div className="py-4">
          <div className="mb-4 text-center">
            <div className="text-sm text-muted-foreground">Amount Due</div>
            <div className="text-2xl font-bold bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
              0.05 ETH
            </div>
            <div className="text-sm text-muted-foreground">≈ $125.00 USD</div>
          </div>
          <div className="mx-auto mb-4 h-48 w-48 rounded-lg bg-black/30 p-2 flex items-center justify-center relative group">
            <Ethereum3DModel className="w-full h-full" />
            <div className="absolute inset-0 rounded-lg border border-white/10"></div>
            
             
          </div>
          <div className="mb-4 rounded-md bg-white/5 p-2 text-center text-sm border border-white/10">
            <span className="font-mono text-xs">0x7F1B543127F8c8bD92b5e3E80D9E5c3ed9b1eD75</span>
          </div>
          <div className="flex justify-center">
            <Button className="w-full bg-gradient-to-r from-teal-400 to-blue-500 hover:from-teal-500 hover:to-blue-600 border-none">
              Copy Address
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-white/10 pt-4 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <RefreshCcw className="h-3 w-3 animate-spin" />
            <span>Refreshing...</span>
          </div>
          <div className="flex items-center gap-1 text-teal-400">
            <Lock className="h-3 w-3" />
            <span>Secure Connection</span>
          </div>
        </div>
      </div>
    </div>
  )
}
