"use client";
import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export const BoxesCore = ({ className, ...rest }: { className?: string }) => {
  const shouldReduceMotion = useReducedMotion();
  
  // Reduced grid size for performance: 30x20 = 600 elements vs 150x100 = 15,000
  // This significantly improves rendering performance while maintaining visual effect
  const rows = new Array(30).fill(1);
  const cols = new Array(20).fill(1);
  
  // Using subtle warm grayscale colors for light theme
  const colors = [
    "rgb(230 230 230)", // gray-200
    "rgb(240 240 240)", // gray-100
    "rgb(245 245 244)", // stone-100
    "rgb(250 250 249)", // stone-50
    "rgb(13 148 136)",  // teal-600 (primary accent)
    "rgb(20 184 166)",  // teal-500
    "rgb(16 185 129)",  // emerald-500
  ];

  const getRandomColor = () => {
    return colors[Math.floor(Math.random() * colors.length)];
  };
  
  // Render static version for users who prefer reduced motion
  if (shouldReduceMotion) {
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
            key={`row` + i}
            className="w-16 h-8 border-l border-border/40 relative"
          >
            {cols.map((_, j) => (
              <div
                key={`col` + j}
                className="w-16 h-8 border-r border-t border-border/40 relative"
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
  }

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
        <motion.div
          key={`row` + i}
          className="w-16 h-8 border-l border-border/40 relative"
        >
          {cols.map((_, j) => (
            <motion.div
              whileHover={shouldReduceMotion ? undefined : {
                backgroundColor: getRandomColor(),
                transition: { duration: 0 },
              }}
              animate={shouldReduceMotion ? undefined : {
                transition: { duration: 2 },
              }}
              key={`col` + j}
              className="w-16 h-8 border-r border-t border-border/40 relative"
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
            </motion.div>
          ))}
        </motion.div>
      ))}
    </div>
  );
};

export const Boxes = React.memo(BoxesCore);
