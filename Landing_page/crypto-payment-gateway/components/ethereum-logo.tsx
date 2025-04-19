"use client"

import { useEffect, useRef } from "react"

export function EthereumLogo({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions
    const size = 200
    canvas.width = size
    canvas.height = size

    // Colors
    const primaryColor = "#3b82f6" // Blue
    const secondaryColor = "#1e40af" // Darker blue
    const glowColor = "rgba(59, 130, 246, 0.5)" // Blue with opacity

    // Animation variables
    let angle = 0
    const centerX = size / 2
    const centerY = size / 2
    const radius = size * 0.35

    // Draw Ethereum logo
    function drawEthereumLogo() {
      if (!ctx) return;
      // Clear canvas
      ctx.clearRect(0, 0, size, size)

      // Draw glow effect
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.5)
      gradient.addColorStop(0, glowColor)
      gradient.addColorStop(1, "rgba(59, 130, 246, 0)")
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius * 1.5, 0, Math.PI * 2)
      ctx.fill()

      // Draw the main hexagon
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate(angle)

      // Draw hexagon
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const x = radius * Math.cos((Math.PI / 3) * i)
        const y = radius * Math.sin((Math.PI / 3) * i)
        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.closePath()

      // Create gradient for hexagon
      const hexGradient = ctx.createLinearGradient(-radius, 0, radius, 0)
      hexGradient.addColorStop(0, primaryColor)
      hexGradient.addColorStop(1, secondaryColor)
      ctx.fillStyle = hexGradient
      ctx.fill()

      // Draw inner details
      ctx.beginPath()
      ctx.moveTo(0, -radius * 0.6)
      ctx.lineTo(-radius * 0.5, 0)
      ctx.lineTo(0, radius * 0.6)
      ctx.lineTo(radius * 0.5, 0)
      ctx.closePath()
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
      ctx.fill()

      ctx.restore()

      // Update animation
      angle += 0.005
      requestAnimationFrame(drawEthereumLogo)
    }

    // Start animation
    drawEthereumLogo()

    // Cleanup
    return () => {
      // Cancel animation frame if component unmounts
      cancelAnimationFrame(0)
    }
  }, [])

  return <canvas ref={canvasRef} className={`${className}`} />
}
