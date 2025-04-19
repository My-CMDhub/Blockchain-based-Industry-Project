"use client"

import { useEffect, useRef } from "react"

export function SecurityShield({ className = "" }: { className?: string }) {
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
    const textColor = "#f8fafc" // Light text

    // Animation variables
    let angle = 0
    const centerX = size / 2
    const centerY = size / 2
    const shieldRadius = size * 0.35
    let pulseSize = 0
    let pulseGrowing = true

    // Draw security shield
    function drawSecurityShield() {
      // Clear canvas
      ctx.clearRect(0, 0, size, size)

      // Draw pulse effect
      if (pulseGrowing) {
        pulseSize += 0.01
        if (pulseSize > 1.2) pulseGrowing = false
      } else {
        pulseSize -= 0.01
        if (pulseSize < 0.8) pulseGrowing = true
      }

      // Draw outer glow
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, shieldRadius * 1.5)
      gradient.addColorStop(0, glowColor)
      gradient.addColorStop(1, "rgba(59, 130, 246, 0)")
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(centerX, centerY, shieldRadius * 1.5 * pulseSize, 0, Math.PI * 2)
      ctx.fill()

      // Draw shield
      ctx.save()
      ctx.translate(centerX, centerY)

      // Shield shape
      ctx.beginPath()
      ctx.moveTo(0, -shieldRadius)
      ctx.arcTo(shieldRadius, -shieldRadius, shieldRadius, 0, shieldRadius)
      ctx.arcTo(shieldRadius, shieldRadius, 0, shieldRadius * 1.2, shieldRadius)
      ctx.arcTo(-shieldRadius, shieldRadius, -shieldRadius, 0, shieldRadius)
      ctx.arcTo(-shieldRadius, -shieldRadius, 0, -shieldRadius, shieldRadius)
      ctx.closePath()

      // Create gradient for shield
      const shieldGradient = ctx.createLinearGradient(-shieldRadius, 0, shieldRadius, 0)
      shieldGradient.addColorStop(0, secondaryColor)
      shieldGradient.addColorStop(0.5, primaryColor)
      shieldGradient.addColorStop(1, secondaryColor)
      ctx.fillStyle = shieldGradient
      ctx.fill()

      // Draw lock icon in center
      ctx.fillStyle = textColor

      // Lock body
      const lockSize = shieldRadius * 0.5
      ctx.fillRect(-lockSize / 2, -lockSize / 4, lockSize, lockSize)

      // Lock arc
      ctx.beginPath()
      ctx.arc(0, -lockSize / 4, lockSize / 2, Math.PI, 0)
      ctx.lineWidth = lockSize / 5
      ctx.strokeStyle = textColor
      ctx.stroke()

      // Lock keyhole
      ctx.beginPath()
      ctx.arc(0, lockSize / 4, lockSize / 6, 0, Math.PI * 2)
      ctx.fillStyle = secondaryColor
      ctx.fill()

      ctx.restore()

      // Update animation
      angle += 0.01
      requestAnimationFrame(drawSecurityShield)
    }

    // Start animation
    drawSecurityShield()

    // Cleanup
    return () => {
      cancelAnimationFrame(0)
    }
  }, [])

  return <canvas ref={canvasRef} className={`${className}`} />
}
