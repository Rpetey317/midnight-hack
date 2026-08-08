"use client";
// beui.dev/components/motion/text-animation

import { motion, type Transition, useInView, useReducedMotion } from "motion/react";
import { useRef, type ElementType, type ReactNode } from "react";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

type SplitMode = "word" | "char";

export interface TextRevealProps {
  text: string | string[];
  as?: ElementType;
  className?: string;
  split?: SplitMode;
  stagger?: number;
  delay?: number;
  blur?: number;
  yOffset?: string | number;
  spring?: { stiffness?: number; damping?: number; mass?: number };
  once?: boolean;
  whileInView?: boolean;
  children?: ReactNode;
}

const DEFAULT_SPRING = { stiffness: 140, damping: 26, mass: 1.2 };

export function TextReveal({
  text,
  as: Comp = "span",
  className,
  split = "word",
  stagger = 0.09,
  delay = 0,
  blur = 12,
  yOffset = "40%",
  spring,
  once = true,
  whileInView = false,
  children,
}: TextRevealProps) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once, amount: 0.4 });
  const reduce = useReducedMotion();
  const shouldAnimate = whileInView ? inView : true;

  const lines = Array.isArray(text) ? text : [text];
  const s = { ...DEFAULT_SPRING, ...spring };
  const preparedLines = lines.map((line, lineIndex) => {
    const units = split === "word" ? line.split(" ") : Array.from(line);
    const priorUnitCount = lines
      .slice(0, lineIndex)
      .reduce(
        (count, priorLine) =>
          count +
          (split === "word"
            ? priorLine.split(" ").length
            : Array.from(priorLine).length),
        0,
      );
    return {
      key: `line-${lineIndex}`,
      units: units.map((unit, unitIndex) => ({
        key: `unit-${unitIndex}`,
        value: unit,
        delayIndex: priorUnitCount + unitIndex,
      })),
    };
  });

  return (
    <Comp ref={ref} className={cn("block", className)}>
      {preparedLines.map((line) => (
          <span key={line.key} className="block">
            {line.units.map((unit, i) => {
              const d = delay + unit.delayIndex * stagger;
              const initial = reduce
                ? { opacity: 0 }
                : { y: yOffset, opacity: 0, filter: `blur(${blur}px)` };
              const animate = shouldAnimate
                ? reduce
                  ? { opacity: 1 }
                  : { y: 0, opacity: 1, filter: "blur(0px)" }
                : initial;
              const transition: Transition = reduce
                ? { opacity: { duration: 0.25, ease: EASE_OUT, delay: d * 0.3 } }
                : {
                    y: { type: "spring" as const, ...s, delay: d },
                    opacity: { duration: 0.7, ease: EASE_OUT, delay: d },
                    filter: { duration: 0.9, ease: EASE_OUT, delay: d },
                  };
              return (
                <motion.span
                  key={unit.key}
                  initial={initial}
                  animate={animate}
                  transition={transition}
                  className="inline-block will-change-transform"
                >
                  {unit.value}
                  {split === "word" && i < line.units.length - 1 ? (
                    <span className="inline-block">&nbsp;</span>
                  ) : null}
                </motion.span>
              );
            })}
          </span>
        ))}
      {children}
    </Comp>
  );
}
