"use client"

import { useEffect, useRef } from "react"

export function PaymentFlow({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions
    const width = 600
    const height = 300
    canvas.width = width
    canvas.height = height

    // Colors
    const bgColor = "#1e293b" // Dark blue background
    const primaryColor = "#3b82f6" // Blue
    const accentColor = "#60a5fa" // Lighter blue
    const textColor = "#f8fafc" // Light text

    // Animation variables
    let animationFrame = 0
    let progress = 0

    // Draw payment flow
    function drawPaymentFlow() {
      // Clear canvas
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, width, height)

      // Draw flow steps
      const steps = 3
      const stepWidth = width / (steps + 1)

      // Draw connecting lines
      ctx.strokeStyle = primaryColor
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(stepWidth, height / 2)

      // Animate the first line
      const line1End = Math.min(2 * stepWidth, stepWidth + progress * stepWidth)
      ctx.lineTo(line1End, height / 2)
      ctx.stroke()

      // Draw second line if first is complete
      if (progress > 1) {
        ctx.beginPath()
        ctx.moveTo(2 * stepWidth, height / 2)
        const line2End = Math.min(3 * stepWidth, 2 * stepWidth + (progress - 1) * stepWidth)
        ctx.lineTo(line2End, height / 2)
        ctx.stroke()
      }

      // Draw nodes
      for (let i = 0; i < steps; i++) {
        const x = (i + 1) * stepWidth
        const y = height / 2
        const radius = 30

        // Node background
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)

        if (i === 0 || (i === 1 && progress > 1) || (i === 2 && progress > 2)) {
          // Completed node
          ctx.fillStyle = primaryColor
        } else if ((i === 1 && progress > 0) || (i === 2 && progress > 1)) {
          // Active node
          ctx.fillStyle = accentColor
        } else {
          // Inactive node
          ctx.fillStyle = "rgba(59, 130, 246, 0.3)"
        }

        ctx.fill()

        // Node icon
        ctx.fillStyle = textColor
        ctx.font = "bold 14px sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"

        if (i === 0) {
          // Draw wallet icon or text
          ctx.fillText("WALLET", x, y)
        } else if (i === 1) {
          // Draw transaction icon or text
          ctx.fillText("PAYMENT", x, y)
        } else if (i === 2) {
          // Draw confirmation icon or text
          ctx.fillText("CONFIRM", x, y)
        }

        // Node label
        ctx.fillStyle = textColor
        ctx.font = "12px sans-serif"
        ctx.fillText(["Connect Wallet", "Send Payment", "Confirmation"][i], x, y + radius + 20)
      }

      // Update animation
      animationFrame++
      if (animationFrame % 60 === 0) {
        progress = (progress + 0.1) % 3
      }

      requestAnimationFrame(drawPaymentFlow)
    }

    // Start animation
    drawPaymentFlow()

    // Cleanup
    return () => {
      cancelAnimationFrame(0)
    }
  }, [])

  return <canvas ref={canvasRef} className={`${className} rounded-lg shadow-lg`} />
}
