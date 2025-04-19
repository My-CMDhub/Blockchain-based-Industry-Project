"use client"

import { useEffect, useRef, useState } from "react"

interface Coin {
  x: number
  y: number
  size: number
  speed: number
  opacity: number
  rotation: number
  rotationSpeed: number
  id: number
}

interface Connection {
  fromId: number
  toId: number
  progress: number
  maxProgress: number
  curveOffset: number
}

function isPointInHexagon(x: number, y: number, centerX: number, centerY: number, size: number): boolean {
  const dx = x - centerX;
  const dy = y - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance <= size;
}

function createNetwork(
  coinsRef: React.MutableRefObject<Coin[]>,
  connectionsRef: React.MutableRefObject<Connection[]>,
  fadeTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  showNetworkRef: React.MutableRefObject<boolean>
) {
  // Each icon connects to 2 random other icons (excluding itself)
  const coins = coinsRef.current;
  connectionsRef.current = [];
  for (let i = 0; i < coins.length; i++) {
    // Get indices of all other coins
    const otherIndices = [...Array(coins.length).keys()].filter(j => j !== i);
    // Shuffle and pick 2
    for (let k = 0; k < 2 && otherIndices.length > 0; k++) {
      const randIdx = Math.floor(Math.random() * otherIndices.length);
      const j = otherIndices.splice(randIdx, 1)[0];
      // Avoid duplicate connections (i->j and j->i)
      if (!connectionsRef.current.some(c => (c.fromId === coins[i].id && c.toId === coins[j].id) || (c.fromId === coins[j].id && c.toId === coins[i].id))) {
        connectionsRef.current.push({
          fromId: coins[i].id,
          toId: coins[j].id,
          progress: 0,
          maxProgress: 1,
          curveOffset: 50 - Math.random() * 100
        });
      }
    }
  }
  showNetworkRef.current = true;
  if (fadeTimeoutRef.current) {
    clearTimeout(fadeTimeoutRef.current);
  }
  fadeTimeoutRef.current = setTimeout(() => {
    showNetworkRef.current = false;
    connectionsRef.current = [];
    console.log("Network effect cleared");
  }, 2000);
  console.log("Network effect triggered for random pairs");
}

export function EthereumCoinsBackground({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [_, setRerender] = useState(0) // force rerender for hover state
  const hoveredCoinRef = useRef<number | null>(null)
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null)
  const connectionsRef = useRef<Connection[]>([])
  const showNetworkRef = useRef<boolean>(false)
  const fadeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const coinsRef = useRef<Coin[]>([])
  const mousePosition = useRef<{ x: number, y: number }>({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas to full screen
    const updateCanvasSize = () => {
      if (!canvas) return
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    updateCanvasSize()
    window.addEventListener("resize", updateCanvasSize)

    // Create coins
    const coins: Coin[] = []
    const coinCount = Math.min(20, Math.floor(window.innerWidth / 60))
    for (let i = 0; i < coinCount; i++) {
      coins.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: 20 + Math.random() * 40,
        speed: 0.2 + Math.random() * 0.5,
        opacity: 0.1 + Math.random() * 0.2,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.01,
        id: i
      })
    }
    coinsRef.current = coins

    // Mouse move handler on window
    function handleMouseMove(e: MouseEvent) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mousePosition.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      let isOverCoin = false;
      for (const coin of coinsRef.current) {
        if (isPointInHexagon(mousePosition.current.x, mousePosition.current.y, coin.x, coin.y, coin.size)) {
          isOverCoin = true;
          if (hoveredCoinRef.current !== coin.id) {
            hoveredCoinRef.current = coin.id;
            setRerender(r => r + 1);
            if (hoverTimerRef.current) {
              clearTimeout(hoverTimerRef.current);
            }
            hoverTimerRef.current = setTimeout(() => {
              createNetwork(coinsRef, connectionsRef, fadeTimeoutRef, showNetworkRef);
            }, 1000);
            console.log("Hovering coin", coin.id);
          }
          break;
        }
      }
      if (!isOverCoin && hoveredCoinRef.current !== null) {
        hoveredCoinRef.current = null;
        setRerender(r => r + 1);
        // Immediately stop the network effect
        showNetworkRef.current = false;
        connectionsRef.current = [];
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = null;
        }
        if (fadeTimeoutRef.current) {
          clearTimeout(fadeTimeoutRef.current);
          fadeTimeoutRef.current = null;
        }
      }
    }
    window.addEventListener('mousemove', handleMouseMove);

    function drawEthereumLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, opacity: number, isHovered: boolean) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rotation)
      ctx.globalAlpha = opacity
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i
        const px = size * Math.cos(angle)
        const py = size * Math.sin(angle)
        if (i === 0) {
          ctx.moveTo(px, py)
        } else {
          ctx.lineTo(px, py)
        }
      }
      ctx.closePath()
      const gradient = ctx.createLinearGradient(-size, 0, size, 0)
      gradient.addColorStop(0, isHovered ? "rgba(45, 212, 191, 0.9)" : "rgba(45, 212, 191, 0.7)")
      gradient.addColorStop(1, isHovered ? "rgba(59, 130, 246, 0.9)" : "rgba(59, 130, 246, 0.7)")
      ctx.fillStyle = gradient
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(0, -size * 0.6)
      ctx.lineTo(-size * 0.5, 0)
      ctx.lineTo(0, size * 0.6)
      ctx.lineTo(size * 0.5, 0)
      ctx.closePath()
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
      ctx.fill()
      ctx.restore()
    }

    function drawConnection(ctx: CanvasRenderingContext2D, fromCoin: Coin, toCoin: Coin, progress: number, curveOffset: number, pulseTime: number) {
      // Start and end points
      const startX = fromCoin.x
      const startY = fromCoin.y
      const endX = toCoin.x
      const endY = toCoin.y
      const midX = (startX + endX) / 2
      const midY = (startY + endY) / 2
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(startX, startY)
      const t = progress
      const curveX = midX + curveOffset * Math.sin(t * Math.PI)
      const curveY = midY + curveOffset * Math.cos(t * Math.PI)
      ctx.quadraticCurveTo(curveX, curveY, startX + (endX - startX) * t, startY + (endY - startY) * t)
      // Dashed line for chain effect
      ctx.setLineDash([8, 8])
      ctx.lineWidth = 1.2
      ctx.strokeStyle = 'rgba(45, 212, 191, 0.35)'; // Subtle teal
      ctx.shadowBlur = 0
      ctx.stroke()
      ctx.setLineDash([])
      // Animated pulse (small glowing dot)
      // Use pulseTime to animate the pulse continuously
      const pulseT = (pulseTime % 2000) / 2000; // 2s loop
      // Quadratic Bezier interpolation for smooth pulse
      const x1 = startX, y1 = startY, x2 = curveX, y2 = curveY, x3 = startX + (endX - startX) * t, y3 = startY + (endY - startY) * t;
      const pulseX = (1 - pulseT) * (1 - pulseT) * x1 + 2 * (1 - pulseT) * pulseT * x2 + pulseT * pulseT * x3;
      const pulseY = (1 - pulseT) * (1 - pulseT) * y1 + 2 * (1 - pulseT) * pulseT * y2 + pulseT * pulseT * y3;
      ctx.beginPath()
      ctx.arc(pulseX, pulseY, 4, 0, 2 * Math.PI)
      ctx.fillStyle = 'rgba(59, 130, 246, 0.5)'; // Subtle blue
      ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
      ctx.shadowBlur = 8;
      ctx.fill()
      ctx.shadowBlur = 0;
      ctx.restore()
    }

    function animate() {
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      // Draw connections
      const now = performance.now();
      if (showNetworkRef.current) {
        for (const connection of connectionsRef.current) {
          const fromCoin = coinsRef.current.find(c => c.id === connection.fromId)
          const toCoin = coinsRef.current.find(c => c.id === connection.toId)
          if (fromCoin && toCoin) {
            connection.progress = Math.min(connection.progress + 0.05, connection.maxProgress)
            drawConnection(ctx, fromCoin, toCoin, connection.progress, connection.curveOffset, now)
          }
        }
      }
      // Draw and update coins
      for (const coin of coinsRef.current) {
        const isHovered = coin.id === hoveredCoinRef.current
        drawEthereumLogo(ctx, coin.x, coin.y, coin.size, coin.rotation, isHovered ? Math.min(coin.opacity * 1.5, 0.9) : coin.opacity, isHovered)
        coin.y += coin.speed
        coin.rotation += coin.rotationSpeed
        if (coin.y - coin.size > canvas.height) {
          coin.y = -coin.size
          coin.x = Math.random() * canvas.width
        }
      }
      requestAnimationFrame(animate)
    }
    animate()

    return () => {
      window.removeEventListener("resize", updateCanvasSize)
      window.removeEventListener('mousemove', handleMouseMove)
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current)
      }
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current)
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`fixed top-0 left-0 w-full h-full pointer-events-none z-0 ${className}`}
    />
  )
}
