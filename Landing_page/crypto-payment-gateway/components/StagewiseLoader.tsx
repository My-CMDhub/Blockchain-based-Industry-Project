'use client';

import React from 'react';
import dynamic from 'next/dynamic';

// Use dynamic import within a client component
const StagewiseToolbarComponent = dynamic(
  () => import('@stagewise/toolbar-next').then(mod => ({ default: mod.StagewiseToolbar })), 
  { ssr: false }
);

export default function StagewiseLoader() {
  const config = {
    plugins: []
  };

  return (
    <>
      {/* CSS fixes for Stagewise / UI conflicts */}
      <style jsx global>{`
        /* Protect gradient text and styles */
        .bg-gradient-to-r {
          background-image: linear-gradient(to right, var(--tw-gradient-stops)) !important;
        }
        .from-teal-400 {
          --tw-gradient-from: #2dd4bf !important;
          --tw-gradient-to: rgb(45 212 191 / 0) !important;
          --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important;
        }
        .to-blue-400 {
          --tw-gradient-to: #60a5fa !important;
        }
        .to-blue-500 {
          --tw-gradient-to: #3b82f6 !important;
        }
        .to-blue-600 {
          --tw-gradient-to: #2563eb !important;
        }
        .bg-clip-text {
          -webkit-background-clip: text !important;
          background-clip: text !important;
        }
        .text-transparent {
          color: transparent !important;
        }
      `}</style>

      {/*  container */}
      <div style={{ 
        position: 'fixed', 
        bottom: '0px', 
        right: '0px', 
        zIndex: 9999,
        isolation: 'isolate'
      }}>
        <StagewiseToolbarComponent config={config} />
      </div>
    </>
  );
} 