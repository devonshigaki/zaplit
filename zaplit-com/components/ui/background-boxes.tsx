"use client";
import React, { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Background Boxes Component
 * 
 * CSS-only animated background grid for visual interest.
 * Replaced framer-motion with CSS animations for 45KB bundle savings.
 * 
 * @performance Reduced from 600 animated nodes to CSS-only hover effects
 */
export const BoxesCore = ({ className, ...rest }: { className?: string }) => {
  // Grid configuration: 15x10 = 150 elements (down from 600)
  const rows = useMemo(() => new Array(15).fill(1), []);
  const cols = useMemo(() => new Array(10).fill(1), []);
  
  // Color palette for hover effects
  const colors = useMemo(() => [
    "rgb(230 230 230)", // gray-200
    "rgb(240 240 240)", // gray-100
    "rgb(245 245 244)", // stone-100
    "rgb(250 250 249)", // stone-50
    "rgb(13 148 136)",  // teal-600
    "rgb(20 184 166)",  // teal-500
    "rgb(16 185 129)",  // emerald-500
  ], []);

  const getRandomColor = () => {
    return colors[Math.floor(Math.random() * colors.length)];
  };

  return (
    <div
      style={{
        transform: `translate(-40%,-60%) skewX(-48deg) skewY(14deg) scale(0.675) rotate(0deg) translateZ(0)`,
      }}
      className={cn(
        "absolute left-1/4 p-4 -top-1/4 flex -translate-x-1/2 -translate-y-1/2 w-full h-full z-0",
        className
      )}
      {...rest}
    >
      {rows.map((_, i) => (
        <div
          key={`row-${i}`}
          className="w-16 h-8 border-l border-border/40 relative"
        >
          {cols.map((_, j) => (
            <div
              key={`col-${j}`}
              className="box-cell w-16 h-8 border-r border-t border-border/40 relative transition-colors duration-0 hover:duration-0"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = getRandomColor();
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "";
              }}
              style={{ willChange: "background-color" }}
            >
              {j % 2 === 0 && i % 2 === 0 ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  className="absolute h-6 w-10 -top-[14px] -left-[22px] text-border/50 stroke-[1px] pointer-events-none"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v12m6-6H6"
                  />
                </svg>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export const Boxes = React.memo(BoxesCore);
