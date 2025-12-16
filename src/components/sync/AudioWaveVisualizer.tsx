"use client";

import React, { useRef, useEffect, useCallback } from "react";
import type { syncAnimState } from "@/types/sync";

interface AudioWaveVisualizerProps {
  /** AnalyserNode for audio analysis */
  analyserNode: AnalyserNode | null;
  /** Whether visualization is currently active */
  isActive: boolean;
  /** Current animation state */
  animState: syncAnimState;
  /** Visualization variant */
  variant?: "bars" | "waveform" | "circular";
}

/**
 * Get color based on animation state
 */
function getStateColor(state: syncAnimState): string {
  switch (state) {
    case "Speaking":
      return "#22c55e"; // Green
    case "Thinking":
      return "#eab308"; // Yellow
    case "Focused":
      return "#3b82f6"; // Blue
    case "Listening":
    default:
      return "#6b7280"; // Gray
  }
}

/**
 * AudioWaveVisualizer - 2D audio visualization component
 *
 * Renders frequency bars or waveform based on audio input.
 * Color and animation intensity change based on state.
 */
export const AudioWaveVisualizer: React.FC<AudioWaveVisualizerProps> = ({
  analyserNode,
  isActive,
  animState,
  variant = "bars",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  /**
   * Draw frequency bars
   */
  const drawBars = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      dataArray: Uint8Array,
      width: number,
      height: number,
      color: string,
    ) => {
      const barCount = 64;
      const barWidth = width / barCount - 2;
      const bufferLength = dataArray.length;
      const step = Math.floor(bufferLength / barCount);

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < barCount; i++) {
        const dataIndex = i * step;
        let barHeight = (dataArray[dataIndex] / 255) * height * 0.8;

        // Add minimum height for idle animation
        if (!isActive || animState === "Listening") {
          barHeight = Math.max(
            barHeight,
            5 + Math.sin(Date.now() / 500 + i) * 3,
          );
        }

        const x = i * (barWidth + 2);
        const y = height - barHeight;

        // Gradient from bottom to top
        const gradient = ctx.createLinearGradient(x, height, x, y);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, `${color}66`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }
    },
    [isActive, animState],
  );

  /**
   * Draw waveform
   */
  const drawWaveform = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      dataArray: Uint8Array,
      width: number,
      height: number,
      color: string,
    ) => {
      ctx.clearRect(0, 0, width, height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.beginPath();

      const sliceWidth = width / dataArray.length;
      let x = 0;

      for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();
    },
    [],
  );

  /**
   * Draw circular visualization
   */
  const drawCircular = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      dataArray: Uint8Array,
      width: number,
      height: number,
      color: string,
    ) => {
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = Math.min(width, height) * 0.25;
      const barCount = 64;
      const step = Math.floor(dataArray.length / barCount);

      for (let i = 0; i < barCount; i++) {
        const dataIndex = i * step;
        let amplitude = dataArray[dataIndex] / 255;

        // Add minimum for idle animation
        if (!isActive || animState === "Listening") {
          amplitude = Math.max(
            amplitude,
            0.1 + Math.sin(Date.now() / 500 + i * 0.2) * 0.05,
          );
        }

        const barLength = baseRadius * 0.5 * amplitude;
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;

        const x1 = centerX + Math.cos(angle) * baseRadius;
        const y1 = centerY + Math.sin(angle) * baseRadius;
        const x2 = centerX + Math.cos(angle) * (baseRadius + barLength);
        const y2 = centerY + Math.sin(angle) * (baseRadius + barLength);

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Draw center circle
      ctx.fillStyle = `${color}33`;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius * 0.8, 0, Math.PI * 2);
      ctx.fill();
    },
    [isActive, animState],
  );

  /**
   * Animation loop
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resizeCanvas();

    const draw = () => {
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;
      const color = getStateColor(animState);

      let dataArray: Uint8Array<ArrayBuffer>;

      if (analyserNode) {
        if (variant === "waveform") {
          const arr = new Uint8Array(analyserNode.fftSize);
          analyserNode.getByteTimeDomainData(arr);
          dataArray = arr as Uint8Array<ArrayBuffer>;
        } else {
          const arr = new Uint8Array(analyserNode.frequencyBinCount);
          analyserNode.getByteFrequencyData(arr);
          dataArray = arr as Uint8Array<ArrayBuffer>;
        }
      } else {
        // Create idle animation data
        const arr = new Uint8Array(128);
        for (let i = 0; i < arr.length; i++) {
          arr[i] = 20 + Math.sin(Date.now() / 500 + i * 0.1) * 10;
        }
        dataArray = arr as Uint8Array<ArrayBuffer>;
      }

      switch (variant) {
        case "waveform":
          drawWaveform(ctx, dataArray, width, height, color);
          break;
        case "circular":
          drawCircular(ctx, dataArray, width, height, color);
          break;
        case "bars":
        default:
          drawBars(ctx, dataArray, width, height, color);
          break;
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    // Handle resize
    window.addEventListener("resize", resizeCanvas);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [
    analyserNode,
    animState,
    variant,
    isActive,
    drawBars,
    drawWaveform,
    drawCircular,
  ]);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="w-full max-w-2xl h-48 sm:h-64 landscape:h-32 landscape:max-h-[40vh]"
      />
    </div>
  );
};

export default AudioWaveVisualizer;
