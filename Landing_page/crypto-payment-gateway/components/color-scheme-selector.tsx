"use client"
import { Palette } from "lucide-react"

interface ColorSchemeSelectorProps {
  currentScheme: string
  onSchemeChange: (scheme: "teal" | "purple" | "blue" | "gold") => void
}

export function ColorSchemeSelector({ currentScheme, onSchemeChange }: ColorSchemeSelectorProps) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-black/30 border border-white/10">
      <Palette className="h-4 w-4 text-white" />
      <div className="flex gap-1">
        <button
          onClick={() => onSchemeChange("teal")}
          className={`h-5 w-5 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 ${
            currentScheme === "teal" ? "ring-2 ring-white" : ""
          }`}
          title="Teal"
        />
        <button
          onClick={() => onSchemeChange("purple")}
          className={`h-5 w-5 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 ${
            currentScheme === "purple" ? "ring-2 ring-white" : ""
          }`}
          title="Purple"
        />
        <button
          onClick={() => onSchemeChange("blue")}
          className={`h-5 w-5 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 ${
            currentScheme === "blue" ? "ring-2 ring-white" : ""
          }`}
          title="Blue"
        />
        <button
          onClick={() => onSchemeChange("gold")}
          className={`h-5 w-5 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 ${
            currentScheme === "gold" ? "ring-2 ring-white" : ""
          }`}
          title="Gold"
        />
      </div>
    </div>
  )
}
