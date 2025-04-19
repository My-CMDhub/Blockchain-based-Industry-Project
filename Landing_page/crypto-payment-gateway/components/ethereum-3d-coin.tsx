"use client"

import { useEffect, useRef } from "react"

export function Ethereum3DCoin({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions with higher resolution for better quality
    const size = 300
    canvas.width = size
    canvas.height = size

    // Colors
    const coinEdgeColor = "#1a1a2e"
    const coinFaceColor = "#2dd4bf"
    const coinHighlightColor = "#7edce2"
    const coinShadowColor = "#0d9488"
    const ethLogoColor = "#ffffff"

    // Animation variables
    let angle = 0
    const coinTilt = 0.1 // Slight tilt for 3D effect
    const centerX = size / 2
    const centerY = size / 2
    const coinRadius = size * 0.35
    const coinThickness = coinRadius * 0.15

    // Floating animation
    let floatOffset = 0
    let floatDirection = 1

    function drawCoin() {
      if (!ctx) return;
      // Clear canvas
      ctx.clearRect(0, 0, size, size)

      // Update floating animation
      floatOffset += 0.02 * floatDirection
      if (floatOffset > 1) floatDirection = -1
      if (floatOffset < -1) floatDirection = 1

      // Calculate coin position with floating effect
      const coinY = centerY + floatOffset * 3

      // Save context for rotation
      ctx.save()
      ctx.translate(centerX, coinY)
      ctx.rotate(angle)

      // Draw coin edge (side)
      ctx.beginPath()
      ctx.ellipse(0, 0, coinRadius, coinRadius * Math.abs(Math.cos(coinTilt)), 0, 0, Math.PI * 2)
      ctx.fillStyle = coinEdgeColor
      ctx.fill()

      // Draw coin face
      ctx.beginPath()
      ctx.ellipse(
        0,
        0,
        coinRadius - coinThickness,
        (coinRadius - coinThickness) * Math.abs(Math.cos(coinTilt)),
        0,
        0,
        Math.PI * 2,
      )

      // Create gradient for coin face
      const gradient = ctx.createRadialGradient(-coinRadius * 0.3, -coinRadius * 0.3, 0, 0, 0, coinRadius)
      gradient.addColorStop(0, coinHighlightColor)
      gradient.addColorStop(0.6, coinFaceColor)
      gradient.addColorStop(1, coinShadowColor)
      ctx.fillStyle = gradient
      ctx.fill()

      // Draw Ethereum logo
      const logoSize = coinRadius * 0.6

      // Draw the diamond shape
      ctx.beginPath()
      ctx.moveTo(0, -logoSize)
      ctx.lineTo(logoSize, 0)
      ctx.lineTo(0, logoSize)
      ctx.lineTo(-logoSize, 0)
      ctx.closePath()
      ctx.fillStyle = ethLogoColor
      ctx.fill()

      // Draw the horizontal line
      ctx.beginPath()
      ctx.moveTo(-logoSize * 0.6, 0)
      ctx.lineTo(logoSize * 0.6, 0)
      ctx.lineWidth = logoSize * 0.15
      ctx.strokeStyle = coinFaceColor
      ctx.stroke()

      // Draw the bottom half of the logo
      ctx.beginPath()
      ctx.moveTo(0, logoSize * 0.3)
      ctx.lineTo(logoSize * 0.6, 0)
      ctx.lineTo(0, logoSize)
      ctx.lineTo(-logoSize * 0.6, 0)
      ctx.closePath()
      ctx.fillStyle = ethLogoColor
      ctx.globalAlpha = 0.7
      ctx.fill()
      ctx.globalAlpha = 1

      // Add shine effect
      ctx.beginPath()
      const shineGradient = ctx.createLinearGradient(-coinRadius, -coinRadius, coinRadius, coinRadius)
      shineGradient.addColorStop(0, "rgba(255, 255, 255, 0.8)")
      shineGradient.addColorStop(0.5, "rgba(255, 255, 255, 0)")
      shineGradient.addColorStop(1, "rgba(255, 255, 255, 0)")

      ctx.fillStyle = shineGradient
      ctx.ellipse(-coinRadius * 0.4, -coinRadius * 0.4, coinRadius * 0.3, coinRadius * 0.1, Math.PI / 4, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()

      // Add glow effect around the coin
      const glowGradient = ctx.createRadialGradient(centerX, coinY, coinRadius * 0.8, centerX, coinY, coinRadius * 2)
      glowGradient.addColorStop(0, "rgba(45, 212, 191, 0.3)")
      glowGradient.addColorStop(1, "rgba(45, 212, 191, 0)")

      ctx.fillStyle = glowGradient
      ctx.beginPath()
      ctx.arc(centerX, coinY, coinRadius * 2, 0, Math.PI * 2)
      ctx.fill()

      // Update animation
      angle += 0.005
      requestAnimationFrame(drawCoin)
    }

    // Start animation
    drawCoin()

    // Cleanup
    return () => {
      cancelAnimationFrame(0)
    }
  }, [])

  return <canvas ref={canvasRef} className={`${className}`} />
}
