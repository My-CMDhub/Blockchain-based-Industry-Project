import type React from "react"
import "./globals.css"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import StagewiseLoader from "../components/StagewiseLoader"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "CryptoGate | Ethereum Payment Gateway",
  description: "Secure, HD wallet-based Ethereum payment gateway for merchants",
  generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-background text-foreground`}>
        {children}
        {/* Include the real Stagewise toolbar in development only */}
        {process.env.NODE_ENV === 'development' && <StagewiseLoader />}
      </body>
    </html>
  )
}
