"use client"

import { useEffect, useRef } from "react"

export function BlockchainVisualization({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions
    const width = 500
    const height = 200
    canvas.width = width
    canvas.height = height

    // Colors
    const bgColor = "#1e293b" // Dark blue background
    const blockColor = "#3b82f6" // Blue
    const lineColor = "#60a5fa" // Lighter blue
    const textColor = "#f8fafc" // Light text
    const highlightColor = "#93c5fd" // Very light blue

    // Animation variables
    let animationFrame = 0
    let activeBlock = 0

    // Block properties
    const blockSize = 60
    const blockSpacing = 40
    const blockCount = 5

    // Draw blockchain
    function drawBlockchain() {
      if (!ctx) return;
      // Clear canvas
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, width, height)

      // Calculate starting position to center the chain
      const totalWidth = blockCount * blockSize + (blockCount - 1) * blockSpacing
      const startX = (width - totalWidth) / 2
      const centerY = height / 2

      // Draw blocks and connections
      for (let i = 0; i < blockCount; i++) {
        const x = startX + i * (blockSize + blockSpacing)
        const y = centerY - blockSize / 2

        // Draw connection line to previous block
        if (i > 0) {
          ctx.strokeStyle = lineColor
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.moveTo(x - blockSpacing, centerY)
          ctx.lineTo(x, centerY)
          ctx.stroke()

          // Draw arrow
          ctx.beginPath()
          ctx.moveTo(x - 10, centerY - 5)
          ctx.lineTo(x, centerY)
          ctx.lineTo(x - 10, centerY + 5)
          ctx.fillStyle = lineColor
          ctx.fill()
        }

        // Draw block
        ctx.fillStyle = i === activeBlock ? highlightColor : blockColor
        ctx.fillRect(x, y, blockSize, blockSize)

        // Draw block number
        ctx.fillStyle = textColor
        ctx.font = "bold 16px sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(`#${i + 1}`, x + blockSize / 2, centerY)

        // Draw hash-like lines inside block
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)"
        ctx.font = "8px monospace"
        for (let j = 0; j < 3; j++) {
          ctx.fillText("0x" + Math.random().toString(16).substr(2, 8), x + blockSize / 2, y + 15 + j * 10)
        }
      }

      // Update animation
      animationFrame++
      if (animationFrame % 60 === 0) {
        activeBlock = (activeBlock + 1) % blockCount
      }

      requestAnimationFrame(drawBlockchain)
    }

    // Start animation
    drawBlockchain()

    // Cleanup
    return () => {
      cancelAnimationFrame(0)
    }
  }, [])

  return <canvas ref={canvasRef} className={`${className} rounded-lg shadow-lg`} />
}
