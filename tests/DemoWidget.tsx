import React, { useState } from 'react';
export default function DemoWidget() {
  const [isPowerOn, setIsPowerOn] = useState(false);
  const [temperature, setTemperature] = useState(22);

  // Complex structural variable to test the new VariablesPanel feature
  const deviceConfig = {
    name: "Living Room AC",
    manufacturer: "SmartClimate Inc.",
    network: {
      status: "Connected",
      signalStrength: 85,
      ip: "192.168.1.104"
    },
    settings: {
      mode: "Cooling",
      fanSpeed: "Auto",
      ecoMode: true
    }
  };
  return <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#0f172a',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '20px'
  }}>
      {/* Widget Container */}
      <div style={{
      width: '380px',
      backgroundColor: isPowerOn ? '#1e293b' : '#1e293b',
      borderRadius: '24px',
      padding: '32px',
      boxShadow: isPowerOn ? '0 20px 40px rgba(56, 189, 248, 0.15), 0 0 0 1px rgba(255,255,255,0.1) inset' : '0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) inset',
      transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
      overflow: 'hidden'
    }}>
        
        {/* Glow Effect when On */}
        <div style={{
        position: 'absolute',
        top: '-50%',
        left: '-50%',
        width: '200%',
        height: '200%',
        background: isPowerOn ? 'radial-gradient(circle at 50% 0%, rgba(56, 189, 248, 0.15) 0%, transparent 50%)' : 'none',
        pointerEvents: 'none',
        transition: 'all 0.5s ease'
      }} />

        {/* Header */}
        <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px',
        position: 'relative'
      }}>
          <div>
            <h2 style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: '600',
            color: '#f8fafc',
            letterSpacing: '-0.02em'
          }}>
              {deviceConfig.name}
            </h2>
            <p style={{
            margin: '4px 0 0 0',
            fontSize: '13px',
            color: '#94a3b8',
            fontWeight: '500'
          }}>
              {deviceConfig.settings.mode} • {deviceConfig.settings.fanSpeed} Fan
            </p>
          </div>

          <button onClick={() => setIsPowerOn(!isPowerOn)} style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          border: 'none',
          backgroundColor: isPowerOn ? '#0ea5e9' : '#334155',
          color: 'white',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          boxShadow: isPowerOn ? '0 0 20px rgba(14, 165, 233, 0.4)' : 'none',
          transition: 'all 0.3s ease'
        }}>

            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
              <line x1="12" y1="2" x2="12" y2="12"></line>
            </svg>
          </button>
        </div>

        {/* Temperature Display */}
        <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        margin: '40px 0',
        position: 'relative'
      }}>
          <div style={{
          display: 'flex',
          alignItems: 'flex-start'
        }}>
            <span style={{
            fontSize: '84px',
            fontWeight: '700',
            color: isPowerOn ? '#f8fafc' : '#475569',
            lineHeight: '1',
            letterSpacing: '-0.04em',
            transition: 'color 0.4s ease'
          }}>
              {temperature}
            </span>
            <span style={{
            fontSize: '28px',
            fontWeight: '600',
            color: isPowerOn ? '#38bdf8' : '#475569',
            marginTop: '8px',
            marginLeft: '4px',
            transition: 'color 0.4s ease'
          }}>
              °C
            </span>
          </div>
          
          <div style={{
          fontSize: "13px",
          fontWeight: "600",
          marginTop: "16px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          transition: "color 0.4s ease"
        }}>
            {deviceConfig.settings.ecoMode && isPowerOn && <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"></path>
                  <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"></path>
                </svg>
                ECO MODE ACTIVE
              </>}
          </div>
        </div>

        {/* Controls */}
        <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '16px',
        opacity: isPowerOn ? 1 : 0.4,
        pointerEvents: isPowerOn ? 'auto' : 'none',
        transition: 'all 0.4s ease'
      }}>
          <button onClick={() => setTemperature(Math.max(16, temperature - 1))} style={{
          width: '60px',
          height: '60px',
          borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.1)',
          backgroundColor: 'rgba(255,255,255,0.03)',
          color: '#f8fafc',
          fontSize: '24px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backdropFilter: 'blur(10px)',
          transition: 'background-color 0.2s'
        }}>

            −
          </button>
          
          <button onClick={() => setTemperature(Math.min(30, temperature + 1))} style={{
          width: '60px',
          height: '60px',
          borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.1)',
          backgroundColor: 'rgba(255,255,255,0.03)',
          color: '#f8fafc',
          fontSize: '24px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backdropFilter: 'blur(10px)',
          transition: 'background-color 0.2s'
        }}>

            +
          </button>
        </div>

        {/* Network Status Footer */}
        <div style={{
        marginTop: '32px',
        paddingTop: '20px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '12px',
        color: '#64748b',
        fontWeight: '500'
      }}>
          <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
            <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: deviceConfig.network.status === 'Connected' ? '#10b981' : '#ef4444',
            opacity: isPowerOn ? 1 : 0.3
          }} />
            {deviceConfig.network.status}
          </div>
          <span>IP: {deviceConfig.network.ip}</span>
        </div>
        
      </div>
    </div>;
}
