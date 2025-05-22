"use client";

import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './poster.css';
import { Zap, CheckCircle, ArrowRight, Globe, Shield, Lock } from 'lucide-react';
import dynamic from 'next/dynamic';

// Static placeholder component for 3D model
const EthereumPlaceholder = () => (
  <div className="eth-static-placeholder">⧫</div>
);

// Dynamically import the 3D model to avoid hydration issues
const Ethereum3DModel = dynamic(
  () => import('@/components/ethereum-3d-model').then((mod) => mod.Ethereum3DModel),
  { ssr: false, loading: () => <EthereumPlaceholder /> }
);

export default function QRCodePoster() {
  // The address to show in the QR code (last address from address_index_map.json)
  const address = "0xd7f5501996901e4f8f411e6042c89a4a73d135ea";
  const [mounted, setMounted] = useState(false);

  // Prevent hydration errors by only rendering client-specific content after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex flex-col justify-center items-center min-h-screen bg-black text-white print:bg-white print:text-black p-4">
      {/* Print button - only visible on screen */}
      <button 
        onClick={() => window.print()} 
        className="mb-4 bg-gradient-to-r from-teal-400 to-blue-500 hover:from-teal-500 hover:to-blue-600 text-white font-bold py-2 px-4 rounded no-print fixed top-4 right-4 z-50"
      >
        Print Poster
      </button>
      
      <div className="w-[210mm] h-[297mm] bg-gradient-to-b from-black to-gray-900 text-white shadow-xl print:shadow-none relative overflow-hidden print-container">
        {/* Background decorative elements - similar to landing page */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] -right-[10%] w-[40%] h-[40%] bg-teal-400/5 rounded-full blur-3xl"></div>
          <div className="absolute top-[60%] -left-[5%] w-[30%] h-[40%] bg-blue-500/5 rounded-full blur-3xl"></div>
          <div className="absolute top-[40%] right-[20%] w-[15%] h-[20%] bg-teal-400/10 rounded-full blur-2xl"></div>
        </div>

        {/* Content container with padding and proper spacing */}
        <div className="relative z-10 flex flex-col items-center h-full p-8 overflow-auto">
          {/* Header with logo - now smaller to save space */}
          <div className="mb-2 text-center flex flex-col items-center pt-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="relative">
                <Zap className="h-10 w-10 text-teal-400" />
                <div className="absolute -inset-1 rounded-full bg-teal-400/20 blur-sm -z-10"></div>
              </div>
              <span className="text-3xl font-bold">CryptoGate</span>
            </div>
            <div className="inline-block rounded-lg bg-white/5 px-3 py-1 text-sm text-teal-400 border border-teal-400/20 mb-2">
              [ Ethereum Payments ]
            </div>
            <h1 className="text-4xl font-bold mb-1 text-white">
              HD Wallet <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">Payment Demo</span>
            </h1>
            <p className="text-lg text-gray-300 max-w-xl">
              Scan the QR code below to make a test payment on the Sepolia network
            </p>
          </div>

          {/* QR Code Center Display */}
          <div className="bg-black/40 border border-white/10 rounded-xl p-6 shadow-lg backdrop-blur-sm flex flex-col items-center mb-6">
            <div className="bg-white p-4 rounded-xl shadow-xl mb-4 qr-code-container">
              <QRCodeSVG 
                value={address}
                size={240}
                level="H"
                includeMargin={true}
                bgColor={"#ffffff"}
                fgColor={"#000000"}
              />
            </div>
            
            <div className="mb-1 text-center">
              <h2 className="text-lg font-semibold mb-1 text-teal-400">Wallet Address:</h2>
              <div className="bg-black/40 border border-white/10 p-3 rounded-lg break-all max-w-2xl text-center text-sm">
                {address}
              </div>
            </div>
          </div>

          {/* Two-column layout for instructions and 3D model */}
          <div className="grid grid-cols-3 gap-4 w-full">
            {/* Instructions - takes 2/3 of the space */}
            <div className="col-span-2 bg-black/30 border border-white/10 p-4 rounded-lg mb-4">
              <h2 className="text-xl font-bold mb-2 text-teal-400 flex items-center">
                <Globe className="mr-2 h-5 w-5" />
                How to use:
              </h2>
              <ol className="space-y-2">
                {[
                  { text: "Set your wallet to Sepolia Test Network", icon: <Globe className="h-5 w-5 text-teal-400" /> },
                  { text: "Get free test ETH from a Sepolia faucet if needed", icon: <Zap className="h-5 w-5 text-blue-400" /> },
                  { text: "Scan this QR code with your wallet app", icon: <Shield className="h-5 w-5 text-teal-400" /> },
                  { text: "Send a small amount of test ETH", icon: <ArrowRight className="h-5 w-5 text-blue-400" /> },
                  { text: "Watch the transaction appear in our HD wallet demo dashboard", icon: <CheckCircle className="h-5 w-5 text-teal-400" /> }
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="mt-0.5 bg-gradient-to-r from-teal-400/20 to-blue-500/20 p-1 rounded-md">
                      {item.icon}
                    </div>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* 3D Model - Only rendered on client after mounting, takes 1/3 of the space */}
            <div className="col-span-1 flex items-center justify-center">
              <div className="relative w-[180px] h-[180px]">
                <div className="absolute inset-0 bg-blue-500/10 blur-xl rounded-full"></div>
                <div className="eth-3d-display relative z-10 w-full h-full">
                  {/* Only render one version of the Ethereum model based on client mounting */}
                  {mounted ? <Ethereum3DModel autoRotate={false} enableZoom={false} /> : <EthereumPlaceholder />}
                </div>
              </div>
            </div>
          </div>

          {/* Security Badge */}
          <div className="flex items-center gap-3 mt-auto mb-4 bg-white/5 px-6 py-3 rounded-full border border-white/10">
            <Lock className="h-5 w-5 text-teal-400" />
            <span className="text-sm">Secure, Private, Traceable Ethereum Payments</span>
          </div>

          {/* Footer - Remove extra model */}
          <div className="mb-4 text-center text-gray-400">
            <p className="text-sm">This is a demonstration of our HD Wallet Payment Gateway</p>
            <p className="text-xs flex items-center justify-center gap-1 mt-1">
              <span className="bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent font-bold">Powered by Ethereum</span>
              <span>·</span>
              <span>Sepolia Test Network</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 