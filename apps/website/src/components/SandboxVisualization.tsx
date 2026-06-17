"use client";

export function SandboxVisualization() {
  return (
    <div className="relative flex items-center justify-center w-full min-h-[400px] md:min-h-[500px]">
      <div
        className="relative w-full max-w-[350px] h-[350px] md:max-w-[500px] md:h-[500px]"
        style={{ perspective: "1400px" }}
      >
        {/* Large Transparent Sandbox Container (outer cube) */}
        <div
          className="absolute inset-0 scale-[0.65] md:scale-[0.8] lg:scale-100"
          style={{
            transformStyle: "preserve-3d",
            transform: "rotateX(-35deg) rotateY(20deg)",
            animation: "gentleRotate 12s ease-in-out infinite",
          }}
        >
          {/* Sandbox walls - with borders */}
          {/* Front face */}
          <div
            className="absolute border-2 border-cyan-400/40"
            style={{
              width: "280px",
              height: "280px",
              background: "rgba(0, 200, 255, 0.05)",
              transform: "translateZ(140px)",
              left: "50%",
              top: "50%",
              marginLeft: "-140px",
              marginTop: "-140px",
              boxShadow:
                "inset 0 0 40px rgba(0, 200, 255, 0.1), 0 0 20px rgba(0, 200, 255, 0.15)",
            }}
          >
            <div
              className="absolute top-2 right-2 text-cyan-400 text-xs font-mono tracking-wider px-2 py-1 rounded"
              style={{
                background: "rgba(0, 0, 0, 0.8)",
                border: "1px solid rgba(0, 200, 255, 0.4)",
                boxShadow: "0 0 10px rgba(0, 200, 255, 0.3)",
              }}
            >
              1. SANDBOX
            </div>
          </div>

          {/* Back face */}
          <div
            className="absolute border-2 border-cyan-400/30"
            style={{
              width: "280px",
              height: "280px",
              background: "rgba(0, 200, 255, 0.03)",
              transform: "translateZ(-140px) rotateY(180deg)",
              left: "50%",
              top: "50%",
              marginLeft: "-140px",
              marginTop: "-140px",
              boxShadow: "inset 0 0 30px rgba(0, 200, 255, 0.05)",
            }}
          />

          {/* Left face */}
          <div
            className="absolute border-2 border-cyan-400/35"
            style={{
              width: "280px",
              height: "280px",
              background: "rgba(0, 200, 255, 0.04)",
              transform: "rotateY(-90deg) translateZ(140px)",
              left: "50%",
              top: "50%",
              marginLeft: "-140px",
              marginTop: "-140px",
              boxShadow: "inset 0 0 30px rgba(0, 200, 255, 0.08)",
            }}
          />

          {/* Right face */}
          <div
            className="absolute border-2 border-cyan-400/35"
            style={{
              width: "280px",
              height: "280px",
              background: "rgba(0, 200, 255, 0.04)",
              transform: "rotateY(90deg) translateZ(140px)",
              left: "50%",
              top: "50%",
              marginLeft: "-140px",
              marginTop: "-140px",
              boxShadow: "inset 0 0 30px rgba(0, 200, 255, 0.08)",
            }}
          />

          {/* Top face - transparent */}
          <div
            className="absolute border-2 border-cyan-400/15"
            style={{
              width: "280px",
              height: "280px",
              background: "transparent",
              transform: "rotateX(90deg) translateZ(140px)",
              left: "50%",
              top: "50%",
              marginLeft: "-140px",
              marginTop: "-140px",
              pointerEvents: "none",
            }}
          />

          {/* Bottom face */}
          <div
            className="absolute border-2 border-cyan-400/30"
            style={{
              width: "280px",
              height: "280px",
              background: "rgba(0, 200, 255, 0.03)",
              transform: "rotateX(-90deg) translateZ(140px)",
              left: "50%",
              top: "50%",
              marginLeft: "-140px",
              marginTop: "-140px",
              boxShadow: "inset 0 0 30px rgba(0, 200, 255, 0.08)",
            }}
          />

          {/* GAL Policy Layer - Sits flat on top of AI Agent */}
          <div
            className="absolute font-mono font-bold flex flex-col items-center justify-center"
            style={{
              transform: "rotateX(90deg) translateZ(110px) translateY(30px)",
              left: "50%",
              top: "50%",
              width: "200px",
              height: "200px",
              marginLeft: "-100px",
              marginTop: "-100px",
              background: "rgba(24, 24, 27, 0.9)",
              border: "2px solid rgba(0, 255, 42, 0.8)",
              borderRadius: "8px",
              boxShadow: `
                0 8px 32px rgba(0, 0, 0, 0.4),
                0 0 30px rgba(0, 255, 42, 0.4),
                0 0 60px rgba(0, 255, 42, 0.2)
              `,
              backdropFilter: "blur(8px)",
              WebkitFontSmoothing: "antialiased",
              textRendering: "optimizeLegibility",
              animation: "pulsePlane 4s ease-in-out infinite",
              zIndex: 100,
            }}
          >
            <div
              className="text-xs tracking-widest font-semibold mb-2 uppercase text-center"
              style={{
                color: "rgba(129, 140, 248, 0.9)",
                letterSpacing: "0.15em",
              }}
            >
              2. Governance Layer
            </div>
            <div
              className="text-4xl tracking-wider text-center"
              style={{
                color: "#00FF2A",
                letterSpacing: "0.4em",
                fontWeight: "900",
                textShadow: "0 0 25px rgba(0, 255, 42, 0.6)",
              }}
            >
              GAL
            </div>
          </div>

          {/* INSIDE THE SANDBOX: Coding Agent */}
          <div
            className="absolute"
            style={{
              transformStyle: "preserve-3d",
              transform: "translateZ(40px) translateY(30px)",
              left: "50%",
              top: "50%",
              marginLeft: "-100px",
              marginTop: "-100px",
            }}
          >
            {/* Agent front face */}
            <div
              className="absolute border-3 border-purple-400/70"
              style={{
                width: "200px",
                height: "200px",
                background: "rgba(168, 85, 247, 0.25)",
                transform: "translateZ(100px)",
                boxShadow:
                  "0 0 40px rgba(168, 85, 247, 0.5), inset 0 0 30px rgba(168, 85, 247, 0.15)",
              }}
            >
              <div
                className="absolute text-purple-300 font-mono font-bold px-2 py-1 rounded text-sm"
                style={{
                  top: "5px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "rgba(0, 0, 0, 0.8)",
                  border: "1px solid rgba(168, 85, 247, 0.5)",
                  boxShadow: "0 0 15px rgba(168, 85, 247, 0.4)",
                }}
              >
                <div className="text-xs opacity-70 text-center">
                  3. AI AGENT
                </div>
              </div>
            </div>
            {/* Agent top face */}
            <div
              className="absolute border-2 border-purple-400/50"
              style={{
                width: "200px",
                height: "200px",
                background: "rgba(168, 85, 247, 0.15)",
                transform: "rotateX(90deg) translateZ(100px)",
                boxShadow: "inset 0 0 30px rgba(168, 85, 247, 0.15)",
              }}
            />
            {/* Agent right face */}
            <div
              className="absolute border-2 border-purple-400/50"
              style={{
                width: "200px",
                height: "200px",
                background: "rgba(168, 85, 247, 0.18)",
                transform: "rotateY(90deg) translateZ(100px)",
                boxShadow: "inset 0 0 30px rgba(168, 85, 247, 0.15)",
              }}
            />

            {/* Workflows inside agent */}
            <div
              className="absolute border-2 border-gray-400/60"
              style={{
                width: "120px",
                height: "60px",
                background: "rgba(100, 100, 100, 0.3)",
                transform: "translateZ(102px)",
                left: "40px",
                top: "80px",
                boxShadow:
                  "0 0 20px rgba(120, 120, 120, 0.4), inset 0 0 15px rgba(120, 120, 120, 0.2)",
                borderRadius: "4px",
              }}
            >
              <div
                className="absolute inset-0 flex flex-col items-center justify-center text-gray-200 font-mono font-bold text-xs"
                style={{
                  background: "rgba(0, 0, 0, 0.4)",
                }}
              >
                <div className="opacity-70">4. WORKFLOWS</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
